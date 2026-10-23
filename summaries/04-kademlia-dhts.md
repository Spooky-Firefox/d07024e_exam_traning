# 04 · Kademlia and distributed hash tables

Sources: [2025 L2 Lab assignment, Kademlia and actors](../D7024E%20Lecture%20slides/D7024E_L2_kademlia_and_actors.pdf), [L4 Distributed hash tables part 1 (handout)](../D7024E%20Lecture%20slides/D7024E_L4-1_DHT.pdf), the Kademlia section of [2026 L7 Data sync](../D7024E_Lectures_2026/D7024E_L7_%20DataSyncReplication.pdf). Kademlia details (part 2 of L4 was recorded only) follow the original paper: Maymounkov and Mazières, "Kademlia: A peer-to-peer information system based on the XOR metric", IPTPS 2002.

## Core ideas

### What a DHT is

A key-value store (put/get) spread over many nodes, usually **decentralized**: all nodes are equivalent, nobody is in charge, nodes join and leave at will (**churn**). Why: scale (data and requests), availability/fault tolerance, no single point of failure.

Another view: a DHT is an **overlay network** with data storage added. Nodes have IDs in the overlay; a notion of "closeness" between IDs defines the topology and allows greedy routing to the node responsible for a key.

### Deriving a DHT (the L4 handout argument)

1. **Plain array / linked list:** Θ(n) put and get. Sorted array: Θ(log n) get, Θ(n) put.
2. **Hash table with buckets:** hash the key, index = hash mod m. Expected Θ(1). Making each bucket a node gives a "distributed hash table" at first glance.
3. **Why mod hashing fails when distributed:** the key-to-bucket mapping depends on m. Doubling m moves half the keys; adding **one** bucket moves essentially **all** keys (only a fraction 1/(m+1) stays). Copying pointers in RAM is cheap; moving keys over the network is not. You also need to know m to find anything, and a central root becomes a bottleneck.
4. **Trees (AVL, B+):** rotations need lots of coordination. **B+ trees** store data only in leaves, and each leaf holds a **range** of keys, so splitting a leaf moves only half of one node's keys. Leaves become shards; the upper tree becomes a directory service clients can cache. Real systems use this, but it is still **centralized** (someone decides who runs the directory).
5. **Decentralize:** the B+ leaves form a linked list. Make it circular, hash keys into a huge finite space (SHA-1/SHA-256, collisions negligible), and each node owns an arc. Walking the list is Θ(N), so add **skip-list shortcuts** at distances 1, 2, 4, 8, … You have reinvented **Chord**.

### Consistent hashing

The point of all range/arc schemes: **adding the (N+1)-th node splits one interval, so only a fraction about 1/(N+1) of keys move**; removing one of N nodes moves about 1/N. The mapping stays consistent, unlike mod hashing. Note that the fraction **shrinks as N grows**: it is not a constant fraction.

Consistent hashing places data by **hash**, not by network locality. It says nothing about round-trip times. Nodes that are neighbours in the ID space may be on different continents (the overlay **stretches** physical distance).

Uniform node IDs still give uneven arcs (the largest is Θ(log N / N) vs mean 1/N). Fix: **virtual nodes**, each machine joins many times (Θ(log M) virtual nodes each) for load balance.

### Example DHTs

| DHT | Topology | Routing state | Lookup hops |
|---|---|---|---|
| **Chord** | ring; key belongs to its successor | finger table Θ(log N) at distances 2^i | Θ(log N) |
| **CAN** | d-dimensional torus split into zones | Θ(d) neighbours (constant) | Θ(d · N^(1/d)) |
| **Kademlia** | XOR metric, binary tree of prefixes | k-buckets, Θ(k log N) | Θ(log N) |
| Koorde, Viceroy | de Bruijn / butterfly | Θ(1) | Θ(log N) ("degree optimal") |

Chord replicates each key on k successors. CAN supports zone overloading (several owners per zone), multiple hash functions and multiple "realities" for redundancy and lower latency; its trade-off between state and hops is tunable via d, and it has more path diversity than Chord.

Properties to compare DHTs on: lookup performance, maintenance overhead, load balance, congestion, stretch, fault tolerance, routing table size vs lookup length.

**DHT vs "immediate" consistent hashing (Cassandra/Dynamo style):** in Cassandra every node knows the full ring (gossiped membership) so a lookup is one hop, which is great in a datacenter of hundreds of nodes. A DHT keeps only O(log N) contacts per node and routes in O(log N) hops, so it scales to millions of nodes with churn where full membership is impossible. So a DHT has the better *scaling* properties; the one-hop ring has better latency at cluster scale.

### Kademlia

- **IDs and keys** are 160-bit values (SHA-1). Node IDs are random; keys are hashes of the content.
- **Distance = XOR** of two IDs, read as an integer. Long common prefix means many leading zeros, means small distance. XOR is symmetric (d(a,b) = d(b,a)), so nodes learn useful contacts from the queries they receive, and unidirectional (for a point and a distance there is exactly one other point).
- A key-value pair is stored on the **k nodes closest to the key** (k = 20 in the paper).
- **Routing table:** for each i in 0..159, a **k-bucket** of up to k contacts whose distance from us lies in [2^i, 2^(i+1)), i.e. that share exactly the first 159 − i bits with us and differ at the next one. Bucket 159 covers half the ID space, bucket 158 a quarter, and so on, so a node knows the far parts of the ID space coarsely (at most k contacts for half the space) and its own neighbourhood in detail. So the **number of buckets depends on the size of the ID space** (160), not on the number of nodes. In the paper the table is a binary tree whose buckets are **split dynamically** (only the bucket covering our own ID is split when full), so the actual number of bucket objects grows with what the node has seen; the simplified lab version is a fixed array of 160 buckets.
- **Bucket update rule:** on hearing from a node, move it to the tail of its bucket. If the bucket is full, ping the least-recently-seen contact; evict it only if it does not answer. Long-lived nodes are preferred (they are statistically likely to stay), which also resists flooding with fresh fake IDs.
- **RPCs:** `PING`, `STORE(key, value)`, `FIND_NODE(id)` (return the k closest contacts you know), `FIND_VALUE(key)` (return the value if stored, else like FIND_NODE).
- **Node lookup (iterative):** take the α (= 3) closest contacts from your own table, send FIND_NODE to them in parallel, merge the answers into a shortlist ordered by distance, query the next α unqueried closest, and stop when a round brings nothing closer and the k closest have all answered. Each round at least halves the remaining distance (one more matching prefix bit), so **lookups take O(log N) hops**, which grows (slowly) with N.
- **Store:** look up the k closest nodes to the key and send STORE to each. **Find value:** like lookup, but stop when someone returns the value; cache it at the closest node that did not have it.
- **Join:** you need one known contact. Insert it, then look up **your own ID** (fills buckets near you and announces you to the neighbourhood), then refresh buckets further away by looking up a random ID in each range. This takes O(log N) lookups, not an O(N) crawl. The table fills gradually from ordinary traffic.
- **Maintenance and consistency:** stored values are **republished** every hour (by the nodes holding them, to the current k closest) and **expire after 24 h** unless the original publisher republishes. A value written at different times can sit on different node sets until republishing catches up, so Kademlia is **eventually consistent** (AP in CAP terms).

**Sweet spot:** immutable, content-addressed, read-heavy data where any copy is as good as another and order does not matter: BitTorrent peer discovery, IPFS, CDN content location, public keys, blockchain headers. DHTs typically store **immutable data objects** but no ordering/history of them (no consensus on order).

**Weak spots:** mutable data (no ordering, concurrent writes land on different nodes), Sybil attacks (one attacker with many IDs; mitigated by preferring old contacts, costly IDs), locality (hops can cross the planet).

### Testing a Kademlia implementation at scale (2025 Q4g, 2025 re-exam)

**What "correct" means** for a DHT, as properties you can check:

1. **Routing table invariants:** every contact in bucket i really has distance in [2^i, 2^(i+1)); no bucket exceeds k; the node never stores itself; least-recently-seen ordering is kept.
2. **Lookup correctness:** `lookup(target)` returns the true k closest *live* nodes, compared with an **oracle** that knows every node ID and computes the answer by sorting by XOR distance. With churn, require high overlap (e.g. ≥ k−1 of k) rather than exact equality.
3. **Lookup efficiency:** hop count grows like log N (measure at N = 100, 1 000, 10 000 and check the curve), messages per lookup stay bounded.
4. **Store/find:** after `store(key, v)`, `find_value(key)` from any random node returns v with high probability, even after a fraction of nodes leave (until republishing/expiry rules say otherwise).
5. **Robustness:** with message loss, duplication, reordering and node crashes injected, lookups still terminate (no hang, timeouts respected) and degrade gracefully.
6. **Concurrency:** no data races (`go test -race`), no goroutine leaks, no deadlocks under parallel lookups.

**How to validate:** unit tests for the XOR metric and buckets; a **simulated network** (the 2026 practical lesson's channel adapter: same `Network` interface as UDP, but in-memory) so thousands of nodes run in one test binary, deterministically with a fixed random seed; **fault injection** (drop/delay/duplicate/partition) in the fake network; property-based and randomized tests over many seeds; compare against the oracle; then repeat a smaller run on the real UDP adapter in Docker to catch encoding/MTU/timing bugs the simulation cannot.

**GenAI-specific concerns:** generated code often looks right but has subtle concurrency bugs (map access without locks, unbounded goroutines, closing channels twice), silently swallowed errors, and tests that only check the happy path or test the implementation against itself. Mitigations: write the properties/oracle yourself before accepting code, review every concurrency boundary, require the race detector and coverage in CI, and treat generated tests as unverified until you have seen them fail on a deliberately broken implementation (mutation testing).

**Pseudocode sketch** (adapted to whatever level of abstraction you like):

```go
func TestLookupFindsKClosest(t *testing.T) {
    rng := rand.New(rand.NewSource(42))           // deterministic
    net := simnet.New(simnet.Loss(0.05), simnet.Delay(0, 20*time.Millisecond))
    nodes := spawnNodes(net, 1000, rng)            // all join via nodes[0]
    waitForStabilisation(nodes)

    for trial := 0; trial < 200; trial++ {
        target := randomID(rng)
        src := nodes[rng.Intn(len(nodes))]
        got, hops := src.Lookup(ctx, target)
        want := oracleKClosest(liveIDs(nodes), target, K) // sort all IDs by XOR
        if overlap(got, want) < K-1 {
            t.Fatalf("trial %d: lookup missed closest nodes", trial)
        }
        if hops > 3*int(math.Log2(float64(len(nodes)))) {
            t.Errorf("trial %d: %d hops, expected O(log n)", trial, hops)
        }
    }
}
```

**Remaining uncertainty after all that:** tests sample a huge state space and cannot prove the absence of rare interleavings; the simulator models the network you thought of, not the real one (NAT, real latency distributions, kernel buffers); behaviour at 10^6 nodes and under adversarial (Sybil/eclipse) attacks is extrapolated; and GenAI may have produced code whose intent you have not fully understood.

## Likely essay angles

- Major properties of a DHT and of the data it stores (2020 Q2a): decentralized, self-organizing under churn, O(log N) lookup with O(log N) state, consistent hashing (small key movement), load balance via uniform hashing/virtual nodes, replication on k nodes, eventual consistency; data is typically immutable, content-addressed (key = hash of value, so tamper-evident), read-heavy, with no global ordering.
- Testing Kademlia and GenAI-generated code (2025 Q4g, re-exam).

## Old exam questions

### Essay questions

- **2020 Q2a**: major properties of a DHT, including properties of the data.
- **2025 Q4g**: verifying GenAI code; pseudocode testing Kademlia lookup/routing at scale.
- **2025 re-exam**: extended essay on building confidence in GenAI-written Kademlia code.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1q / 2023 Q1r / 2024 Q1r | Consistent hashing places data to get short round-trip times | **False**. Placement follows the hash, not network locality. |
| 2018 Q1r | DHTs are decentralized and scale better than logical-ring consistent hashing | **Depends/True**. A DHT needs only O(log N) state per node and tolerates churn at huge scale; a full-membership ring gives one-hop lookups but every node must know every other. |
| 2023 Q1t | A DHT scales better than immediate consistent hashing (Cassandra) | **True** (same reasoning) |
| 2019 Q1d | Kademlia routing is O(n) | **False**. O(log n). |
| 2019 Q1e | Number of k-buckets depends on number of active nodes | **False** (depends on ID size; with the paper's dynamic splitting the *materialized* buckets do depend on which nodes you have seen, worth one sentence) |
| 2019 Q1f | DHTs store immutable objects but not immutable history (ordering) | **True** |
| 2020 Q1g | Kademlia routing is constant time | **False** |
| 2020 Q1h | Number of k-buckets depends on the size of the address space | **True** (160 for 160-bit IDs) |
| 2020 Q1i | DHTs typically store immutable data objects | **True** |
| 2021 Q1j | Kademlia worst case O(log n), independently of number of nodes | **False**. O(log n) *is* a dependence on n (just a slow one). |
| 2021 Q1k | Number of k-buckets can change dynamically | **Depends**. Yes in the paper's tree (buckets split); no in a fixed 160-bucket array. |
| 2021 Q1l | DHTs can be completely decentralized | **True** |
| 2022 Q1i | O(log n) lookup once the table is filled, but O(n) to fill it | **False**. Joining takes O(log n) lookups; the table fills from normal traffic. |
| 2025 Q1d | A DHT is an overlay network with data storage functionality | **True** |
| 2025 Q1j | Consistent hashing moves only a constant fraction of keys | **False**. About 1/(N+1): small, but it depends on N. |

# 02 · Consensus

Sources: [2025 L7 Distributed consensus (Olov)](../D7024E%20Lecture%20slides/D7024E_L7_Consensus.pdf), [2025 L8 BFT consensus and blockchain (Christoffer)](../D7024E%20Lecture%20slides/D7024E_L8_bft_consensus-presentation.pdf). In 2026 this is L5 (leader election and consensus) and L6 (blockchains and BFT).

## Core ideas

### What consensus is

Agreeing on a value. These are all the same problem: consensus, Byzantine agreement, **atomic (total order) broadcast**, **state machine replication** and **log replication**. Consensus is what you use to implement strong consistency (linearizability).

Two requirements:

- **Safety:** every correct node decides the same value; only a proposed value can be chosen; nobody learns a value that was not chosen. "Nothing bad ever happens." Needs enough correct nodes in every decision that two disjoint groups cannot decide separately.
- **Liveness:** every correct node eventually decides. "Something good eventually happens."

Safety must always hold. Liveness can **not** be guaranteed in general: the **FLP impossibility result** says no deterministic protocol can guarantee liveness in a fully asynchronous network even with a single crash fault. Liveness having been reached does not give you safety, and vice versa. Practical protocols are always safe and live "if a large enough subset is non-faulty and connected for long enough" (partial synchrony).

To reach consensus at all you must assume something: who and how many the participants are (a known membership), that a majority (or > 2/3) is alive and connected, and how the network behaves.

### Failure models

- **Crash (fail-stop):** a node works correctly or not at all.
- **Byzantine:** a node can do anything: crash, delay, duplicate, send garbage or carefully crafted lies, send different things to different nodes. A superset of crash faults. "Byzantine" does not mean "malicious": a crashed honest node is also faulty. What matters is *what* a node can do, not *why*.
- Most distributed systems and most consensus protocols are **non-Byzantine** (crash fault tolerant, CFT): they assume nobody lies.

### Thresholds (memorise this table)

| Setting | Tolerates | Needs nodes | Quorum |
|---|---|---|---|
| Crash faults (Paxos, Raft, Zab) | f crashes, f < n/2 | n ≥ 2f + 1 | majority, > n/2 |
| Byzantine, partially synchronous (PBFT, Tendermint, HotStuff) | f < n/3 | n ≥ 3f + 1 | > 2n/3 (2f + 1) |
| Byzantine, synchronous + signatures | f < n/2 | n ≥ 2f + 1 | > n/2 |
| Bitcoin (PoW, longest chain) | < 1/2 of hash power | | |

**Why majority works for crash faults:** any two majorities intersect, so at least one node in every new quorum has seen every committed entry.

**Why majority fails for Byzantine faults:** a Byzantine leader can propose A to one half and B to the other; with its own vote each side gets a "majority", so two correct nodes decide different values. Even a non-leader Byzantine node that can talk to both sides of a partition can vote twice. Unanimity does not work either (a Byzantine node just refuses to answer, killing liveness).

**Why 1/3:** you cannot tell a crashed node from a slow one, so when waiting for votes you can only wait for n − f. Of the ones that answered, up to f may be lying. With n = 3f + 1 and a quorum of 2f + 1, two quorums overlap in at least f + 1 nodes, so at least one correct node is in both, and a correct node never votes for two conflicting values.

**Why synchrony helps:** with a known bound Δ on delivery, a node that does not answer within 2Δ has crashed, so partitions cannot hide correct nodes and > 1/2 works again (with signatures).

### Byzantine generals (Lamport, Shostak, Pease)

Loyal generals must agree on attack/retreat; traitors lie. With oral (pairwise, unsigned) messages there is no solution if 1/3 or more are traitors: you need ≥ 3m + 1 generals for m traitors. **Signed messages** (unforgeable, verifiable signatures) let loyal lieutenants prove the commander sent conflicting orders. Assumptions behind the result: every message arrives, the receiver knows the sender, and missing messages can be detected (timeouts, sequencing). Many consensus systems sit on top of a reliable messaging layer that provides exactly these.

### Two-phase commit and why it is not enough

Coordinator proposes, participants vote yes/no, coordinator tells everyone commit or abort. Gives atomicity across nodes but **blocks if the coordinator crashes** after participants voted yes: they cannot decide alone. Consensus protocols fix this by electing a new leader.

### Paxos

- Non-Byzantine, asynchronous, **always safe, not guaranteed live**.
- Roles: proposer, acceptor, learner (a node usually plays several).
- Each round has a unique increasing number and one leader (proposer), but the leader can change every round.
- Phase 1a prepare(n) → 1b promise (do not accept anything numbered < n; report highest accepted n′ and value v′). Phase 2a accept(n, v) after a majority of promises → 2b accepted to all learners. Chosen once a majority accepts.
- Dueling proposers can livelock; randomized back-off timers fix it in practice.
- At least 4(n − 1) messages per successful round. n ≥ 2f + 1 acceptors.
- Used in Chubby, Spanner, Petal, Frangipani.

### ZooKeeper and Zab

- A replicated, hierarchical key-value store of **znodes** (like a filesystem), used for configuration, naming, group membership, locks and leader election.
- **Ephemeral znodes** disappear when the client's session dies: handy for liveness tracking and membership. **Sequence znodes** get a monotonically increasing suffix (used for locks and election). **Watches** are one-time triggers.
- Every server holds the full data in memory. Clients read from any server (so reads scale and may be slightly stale), but all **writes go through the leader** and are acknowledged when a majority has persisted them. Adding servers increases read throughput and fault tolerance; write throughput does not improve (it gets slightly worse).
- **Zab** (ZooKeeper atomic broadcast): primary-order atomic broadcast. Uses the three-phase election only to choose a long-lived leader, then FIFO TCP channels. Each new leader starts a new **epoch**; zxid = (epoch, counter). Guarantees reliable delivery, total order and the prefix property. A new leader must have the highest zxid; uncommitted proposals from an old epoch are discarded.
- Limits: watch "herd effect" when many clients watch the same znode; not meant for large numbers of members writing frequently; geo-distributing an ensemble is costly.

### Raft (know this one in detail)

Designed for understandability. Equivalent in power to (multi-)Paxos.

- **What is replicated:** a **log of client commands**. Every server applies the same commands in the same order to its state machine, giving a replicated state machine. Raft replicates a log, not a data structure like ZooKeeper's znode tree.
- **Server states:** follower, candidate, leader. Clients talk only to the leader.
- **Terms:** logical epochs numbered 1, 2, 3, … Each term starts with an election and has at most one leader. Every RPC carries the sender's term. A server that sees a higher term updates its term and steps down to follower; messages from older terms are rejected. Terms act as a logical clock that detects stale leaders (e.g. an old leader returning after a partition) and makes sure each vote is for at most one candidate per term.
- **Leader election:** followers expect heartbeats (empty AppendEntries). After a randomized **election timeout** (150–300 ms), a follower increments its term, becomes candidate, votes for itself and sends RequestVote. A majority of votes makes it leader. A split vote ends the term without a leader; randomized timeouts make a repeat unlikely.
- **Log replication:** the leader appends the command, sends AppendEntries in parallel, and once a majority has stored it the entry is **committed** and applied. Followers learn the commit index from later AppendEntries/heartbeats. AppendEntries carries (prevLogIndex, prevLogTerm); a follower rejects it if it lacks that entry, and the leader walks back until the logs match, then overwrites the follower's conflicting suffix.
- **RPCs are idempotent**, so the leader can simply resend to slow followers.
- **Log matching property:** if two logs have an entry with the same index and term, they store the same command and all previous entries are identical.
- **Election restriction:** a voter refuses a candidate whose log is less up to date than its own (compare last term, then last index). Because two majorities intersect, the winner has every committed entry.
- **Committing old entries:** a leader only commits entries from its *current* term by counting replicas; older entries become committed indirectly.
- Fault tolerance: n = 2f + 1 servers tolerate f crashes. Typically 3, 5 or 7 servers.
- **etcd** is a key-value store on Raft. It stores Kubernetes cluster state. It replicates everything to every member: no sharding, no write scale-out. Store metadata and configuration there, not bulk data.

### Leader-based consensus: the trade-off

Efficient for non-Byzantine consensus (one leader orders everything, one round trip to a majority per write), but:

- the leader is a write bottleneck; writes do not scale by adding nodes,
- every write needs a majority round trip, so geographic spread adds latency,
- it trusts the leader completely, so it is not Byzantine tolerant.

Use it for small, slowly changing, critical state: membership, leader election, configuration, locks. Massively distributed stores (Kademlia, Cassandra in eventual mode) avoid global consensus on the data itself.

Other leader-election schemes from Olov's lecture: ring-based (token passes around a logical ring) and bully (highest ID wins).

### PBFT (Practical Byzantine Fault Tolerance)

- Partial synchrony, f < n/3, n = 3f + 1, quorum 2f + 1.
- Like Raft it has **views** (≈ terms), each with a stable primary. Unlike Raft, primaries rotate **deterministically** (round robin), with no voting election; a **view change** replaces a faulty primary.
- Three phases: **pre-prepare** (primary proposes and assigns a sequence number), **prepare** (every backup broadcasts its vote to everyone), **commit** (once a node has 2f + 1 matching prepares it broadcasts commit; with 2f + 1 commits it executes and replies). The client waits for f + 1 matching replies.
- Votes are **broadcast all-to-all**, so communication is **Θ(n²)** messages per decision. Optimistic responsiveness: decides in O(δ), the actual network delay.
- Improvements: signature aggregation gets O(n) (collect votes at a leader, aggregate into one certificate); Tendermint gains load balance and linear view change but waits Δ; HotStuff regains responsiveness and pipelining with a fourth round; HotStuff-2 is back to three rounds.

**PBFT trade-offs as nodes increase (2024 Q2e):**

- **Security/fault tolerance:** more nodes tolerate more faults (f = ⌊(n − 1)/3⌋), and an attacker must compromise more independent machines. Only true if nodes are genuinely independent (different operators, software, locations).
- **Performance:** messages per decision grow as O(n²), so bandwidth and CPU for signature verification explode; latency grows because each phase waits for 2f + 1 of a larger group and the slowest of them; throughput drops.
- **Scalability:** practical up to tens of nodes, not thousands. View changes get more expensive too. Mitigations: signature aggregation/threshold signatures (O(n)), HotStuff-style linear protocols, committees (a random subset runs consensus), sharding.

### The command log abstraction (2024 Q2b)

A totally ordered, append-only, replicated log of commands. Properties: **total order** (everyone agrees on the sequence), **durability** (a committed entry survives failures because a quorum stored it), **agreement/immutability** of the prefix (a committed entry never changes), and **determinism** (same log → same state everywhere). Ensured by a leader that sequences commands, quorum acknowledgement before commit, terms/epochs to fence off stale leaders, the election restriction, and log matching checks.

- **Non-Byzantine** (Raft, Zab, Paxos): trusts the leader; majority quorums; n = 2f + 1; cheap (O(n) messages), small clusters.
- **Byzantine** (PBFT, blockchains): nodes may lie, so every step is signed and cross-checked; quorums > 2/3; n = 3f + 1; all-to-all votes (O(n²)) or PoW/PoS for open membership.

## Likely essay angles

- **What does it mean to be Byzantine (2021 Q2a):** arbitrary behaviour (lie, equivocate, crash, delay), not necessarily malicious; tolerating it needs n ≥ 3f + 1 under partial synchrony.
- **Raft: what is replicated and why terms (2021 Q2d, 2022 Q2b):** replicated command log; terms as logical epochs that fence stale leaders, enforce one vote per term, and order log entries for the election restriction and log matching.
- **Command log abstraction and Byzantine vs non-Byzantine (2024 Q2b):** see above.
- **PBFT scaling trade-offs (2024 Q2e):** see above; be explicit about which dimension (message complexity, latency, throughput, fault threshold, attack cost) you mean.

## Old exam questions

### Essay questions

- **2021 Q2a**: what it means to be Byzantine.
- **2021 Q2d**: what Raft replicates; the need for terms.
- **2022 Q2b**: why terms are used in non-Byzantine consensus.
- **2024 Q2b**: command log abstraction; Byzantine vs non-Byzantine.
- **2024 Q2e**: PBFT trade-offs between performance, scalability and security as nodes increase.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1g | A replicated command log ensures commands are ACID | **False/Depends**. It gives total order, durability and identical replicas; isolation of multi-command client transactions still needs concurrency control on top. |
| 2018 Q1h | Consensus requires new nodes to join automatically to scale out writes | **False**. Membership must be known; writes do not scale with more nodes. |
| 2018 Q1i / 2023 Q1f | You must assume connectivity or fraction of nodes alive to reach consensus | **True** |
| 2024 Q1f | ...assumptions on connectivity *and* fraction alive | **True** (FLP; quorum needs a known membership that is mostly alive and connected) |
| 2018 Q1j / 2023 Q1e | Non-Byzantine consensus assumes a small number of traitors | **False**. It assumes nobody lies. |
| 2019 Q1k / 2020 Q1n / 2021 Q1q | Leader-based consensus assumes a small number of traitors | **False** |
| 2019 Q1l / 2020 Q1o | Leader-based consensus is efficient for non-Byzantine consensus | **True** |
| 2019 Q1r / 2023 Q1p | Safety and liveness must be ensured to reach consensus | **Depends**. Safety must always hold; liveness cannot be guaranteed (FLP), only reached when the network behaves for long enough. |
| 2019 Q1s | ZooKeeper is good for nodes to record whether each is alive | **True**. Ephemeral znodes plus watches. |
| 2023 Q1q | ...for a *large number* of nodes | **Depends/False**. Writes go through one leader and watches cause herd effects; for very many nodes use gossip-based membership. |
| 2020 Q1e / 2021 Q1g | Global consensus is an example where high scalability is obtained | **False** |
| 2020 Q1t | If liveness is provided, safety follows | **False**. They are independent. |
| 2020 Q1u | Raft is a good intermediate for handshaking and tracking which nodes are alive | **False**. Raft replicates a log among a small fixed cluster; it is not a membership service for many nodes (ZooKeeper/etcd leases or gossip are). |
| 2022 Q1d | Leader-based consensus handles many nodes and geographic spread | **False** |
| 2022 Q1o | Leader-based consensus assumes a non-Byzantine trust model | **True** |
| 2024 Q1b | A distributed DB needs a transaction log to handle consensus | **Depends/False**. A local transaction log is for local durability; consensus needs a *replicated* log driven by a protocol like Raft. |
| 2024 Q1e | Byzantine consensus handles a majority of traitors | **False**. < 1/3 (partially synchronous) or < 1/2 (synchronous with signatures). |
| 2024 Q1j | Leader-based architectures with automatic elections are used for scalability where immediate consistency is required | **Depends**. They give immediate consistency and fault tolerance, and can scale reads, but writes still funnel through one leader. |
| 2025 Q1c | Non-Byzantine consensus is designed to be horizontally scalable | **False** |
| 2025 Q1e | Non-Byzantine pairwise messaging needs N = 2f + 1 to handle f failures | **True** |
| 2025 Q1f | BFT is hard because there can be dishonest nodes but honest nodes may also crash | **True**. A crash is also a fault, and you cannot tell crashed from slow. |

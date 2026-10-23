# 05 · Consistency and replication

Sources: [L3 Communication, time and ordering (Carl)](../D7024E%20Lecture%20slides/D7024E_L3_communication_and_protocols.pdf), [2025 L5 Data sync and replication](../D7024E%20Lecture%20slides/D7024E_L5_DataSyncReplication.pdf), [2025 L6 Collaborative editing](../D7024E%20Lecture%20slides/D7024E_L6_RealtimeCollaboration.pdf), [2026 L7 Data sync and replication](../D7024E_Lectures_2026/D7024E_L7_%20DataSyncReplication.pdf) (the newest and most complete version, by the examiner).

## Core ideas

### Replication vs sharding vs caching vs erasure coding

- **Sharding (partitioning):** each node holds a *different* part. Solves "too much data/load for one node". Scalability.
- **Replication:** each node holds the *same* data. Solves "a node might fail" and gives read locality. Availability and fault tolerance.
- **Caching:** a temporary copy near the reader; fast but possibly stale ("when do I throw the copy away?": TTL, write-through, invalidation events).
- **Erasure coding (2026 L7):** split data into k fragments plus m parity fragments; any k of k + m rebuild everything. XOR parity: P = D1 ⊕ D2 ⊕ D3, and a lost D2 = D1 ⊕ D3 ⊕ P. RS(4,2) stores 1 GB in 1.5 GB and survives 2 losses (3× replication needs 3 GB) but reads and repairs cost more bandwidth and updates rewrite all parity. Good for large, cold, immutable objects; bad for small hot records.
- **Replication keeps copies; synchronization reconciles them.** Most of the hard policy lives in synchronization.

### Who may accept a write

- **Single leader:** one leader orders all writes, followers apply them. Simple; leader is a bottleneck and fail-over risk. Reads from followers can be stale.
- **Multi-leader:** several sites accept writes (one per region, or every offline phone). Concurrent writes are unavoidable, so a **conflict policy is mandatory**.
- **Leaderless (Dynamo-style):** clients write to and read from several replicas and wait for a quorum (W + R > N for overlapping quorums).
- "Write" means three things: saved on this device, acknowledged by the service, visible to others.
- Quorum example from the lab: STORE to k = 3 nodes. Wait for 1 ack (fast, weakest), a majority (durable enough, still available), or all k (strongest, but one dead node blocks the write).
- **Master–slave (primary–backup)** scales *reads* by reading from slaves, but those reads are only eventually consistent. If you need fast, immediate consistency you must read from (or synchronously replicate through) the master, which does not scale writes.
- **Index/directory nodes:** with sharding plus replication and a need for immediate consistency on mutable data, the common approach is some kind of index or leader per shard that guides writes to the right storage nodes (directory service, per-shard leader, Bigtable/HBase master, Kafka partition leader).

### Idempotency

Retries create duplicates. "count += 1" applied twice is wrong; "set task 7 done = true" applied twice is fine. Make any operation idempotent by giving it an ID and recording processed IDs in the same transaction. **Every retry protocol creates duplicates: either the operation is naturally idempotent or you make it so, never neither.**

### Read anomalies

With replicas behind a load balancer: Alice writes x = 1 to replica A, then reads from replica B before sync and gets nothing (**read-your-writes** violation). Bob reads 1 from A then null from B (**non-monotonic reads**). Charlie sees Bob's answer "I'm in Sweden" before Alice's question (**causality violation**).

### CAP

- **C**onsistency (here: linearizability, every read sees the latest completed write), **A**vailability (every request to a non-failing node gets an answer), **P**artition tolerance (keep working when the network splits).
- **During a partition you must choose C or A.** Proof sketch: a write reaches A, a read reaches B, A and B cannot talk. B either answers with the old value (violates C) or waits/refuses (violates A).
- Without a partition you can have both, so "it is possible to build a system that is both consistent and available" is true **as long as there is no partition** (or the system is a single node). Decide per operation, not per system: a note can be AP, a booking must be CP.
- **CP:** etcd, ZooKeeper, MongoDB (default), banking. **AP:** Cassandra, DynamoDB, offline-first apps, **Kademlia**. **CA:** only a single-node system.
- Why it is hard at all: you cannot set global state instantaneously; light is slow; messages are lost or delayed.

### Consistency models (strongest to weakest)

| Model | Guarantee | Typical implementation | Cost |
|---|---|---|---|
| **Linearizability** (strong) | Behaves like one single copy; every operation takes effect at one instant inside its call interval, in **real-time** order. If my operation starts after yours completed, I see yours. | consensus (Raft), single leader with sync replication | slow, unavailable under partition |
| **Sequential** | One total order of all operations that respects each client's **program order**, but not real time (you may be late, but everyone hears the same story) | replicated log / sequencer (Kafka partition), blockchains | needs a global order |
| **Causal** | Operations related by happens-before are seen in that order by everyone; concurrent ones may differ | vector clocks, dependency tracking, buffer until dependencies applied (COPS) | the strongest model that stays available under partition |
| **Session** | Within one client session: read-your-writes, monotonic reads, monotonic writes, writes-follow-reads | sticky sessions, sequence IDs | cheap |
| **Eventual** | If writes stop, replicas eventually converge; no promise about when or order | anti-entropy, gossip, republishing (Kademlia) | fastest, always available |
| **Weak / best effort** | No promise; may propagate to some, all or none | UDP, game positions | real-time systems |

Rule of thumb from the 2026 intro: pick the **weakest** model your application survives. Bank balance: strong. Chat: causal (the answer must never appear before the question). Like counter: eventual.

Linearizability test: can you place one point per operation inside its time interval so the sequence explains every answer? If not, it is not linearizable.

**"Typical approach to consistency in datastores of mutable data" (2021 Q2f):** use a leader (primary) per data item or shard that orders all writes and replicates them to followers, with a consensus protocol (Raft/Paxos) or quorum writes to agree on order and survive fail-over; reads go to the leader or require a quorum for strong consistency. Weaker alternative: accept writes anywhere, version them (vector clocks), reconcile later (LWW, CRDTs) for eventual consistency.

### Atomic writes across replicas: two-phase commit

Coordinator sends prepare; replicas vote OK; coordinator sends commit; replicas ack. Gives atomicity across nodes, but **blocks if the coordinator crashes** after the vote. Three-phase commit and consensus-based commit address this.

### Time, ordering and clocks

- **Physical clocks** drift (quartz about 50 ppm, temperature-dependent; 1 ppm ≈ 86 ms/day). Even synchronized clocks can give t2 < t1 for a message that logically came later: **timestamp order can contradict causality**.
- **Happens-before (→)** (Lamport 1978): a → b if same node and a first; or a is send(m) and b is receive(m); or transitively. It is a **partial order**. If neither a → b nor b → a, they are **concurrent** (a ∥ b). a → b means a *might* have caused b; a ∥ b means it cannot have.
- **Lamport clock:** counter t; +1 on every event; send t with messages; on receive t = max(t, t′) + 1. Property: a → b ⇒ L(a) < L(b). The converse does **not** hold, and two events can have the same L. Break ties with node ID to get a **total order** (L(a), N(a)) that is consistent with causality. So logical clocks *can* create a total order.
- **Vector clock:** one counter per node. Increment own entry on events; on receive take element-wise max, then increment own. V(a) < V(b) (all ≤ and at least one <) ⇔ a → b. If some entries are larger and some smaller, the events are **concurrent**. Vector clocks **detect concurrency**, Lamport clocks cannot. Cost: one entry per node.
- **Causal delivery with vector clocks:** apply a write from replica j tagged V only when V[j] = local[j] + 1 and V[k] ≤ local[k] for all other k; otherwise buffer it.
- Vector clocks and eventual consistency rely on **immutable messages**: if a message could change after being sent, its timestamp no longer describes what it carries and replicas could converge to different states. (Also: if messages are retransmitted, applying them must be idempotent.)

**Total vs causal order:** a total order settles every pair (needs coordination: a replicated log). A causal order settles only pairs that could have influenced each other and leaves concurrent ones to reconciliation (stays available).

### Deletes (2026 L7)

Absence carries no information: "I never had X" and "I deleted X" look the same. Three failure modes: **resurrection** (anti-entropy finds X on an offline replica and copies it back), **delete vs concurrent edit** (no timestamp settles it), **stale read** (Carol reads from a replica the delete has not reached). Fix: **tombstones** ("deleted X at version v") that win over older copies, kept until every replica has seen them; then garbage-collect (or force replicas offline longer than the retention window to resync fully).

### Synchronization mechanisms (2026 L7)

- **Log shipping:** followers replay the leader's log from a resume position; beyond the retention window, install a snapshot then replay the tail. Raft (prevLogIndex/prevLogTerm), PostgreSQL WAL, Kafka offsets, change-data capture.
- **Merkle-tree anti-entropy** (Dynamo): compare root hashes, descend only into differing subtrees, fetch only differing keys. Include version and deletion marker in leaf hashes.
- **Anti-entropy** (Demers 1987): each replica periodically picks a random peer and exchanges summaries (version vector or Merkle root) and missing updates (push–pull). Spreads to all in O(log n) rounds. Merges must be idempotent.

### CRDTs (conflict-free replicated data types)

- Replicas update locally without coordination, exchange state or operations, and are **guaranteed to converge** to the same state, regardless of delivery order or duplicates. No locks, no consensus, no central server: ideal for offline-first and peer-to-peer apps.
- Maths: states form a **join-semilattice**; merge is the least upper bound, which is **commutative** (order of arrival does not matter), **associative** (batching does not matter) and **idempotent** (duplicates are harmless). Break any of these and convergence fails.
- Convergence is conditional on delivery: an isolated replica does not magically learn remote edits.
- **State-based** (send the whole state, merge) vs **operation-based** (send operations; requires reliable causal delivery).
- Examples: **G-Counter** (one counter per replica; merge = element-wise max; value = sum), PN-Counter (two G-Counters), G-Set, OR-Set, **LWW register** (keep the value with the highest timestamp; tie-break on replica ID: deterministic but silently loses the other write), **multi-value register** (keep all concurrent values and let the UI show the conflict).
- Used in Automerge, Yjs, Riak, Redis Enterprise, Apple Notes, Figma, Zed.

### Collaborative editing: OT vs sequence CRDTs

Principles: apply changes locally (optimistic), sync in the background, resolve conflicts automatically, **preserve user intent**. Locking or turn-taking is too slow (every keystroke a round trip).

The problem with indices: Alice deletes "A" at index 0 of "ABCD" while Bob inserts "X" after "A" (index 1). Applying each other's raw operations gives "XBCD" vs "BXCD": diverged.

**Operational transformation (OT):**

- Transform an incoming operation against concurrent operations already applied (shift Bob's insert index from 1 to 0 because a character before it was deleted).
- **Jupiter** (Xerox PARC; early Google Docs, Etherpad, Wave): a **central server**; each client and the server keep a 2-D state space (client ops, server ops) and transform on both sides until they meet at the same state.
- Pros: strong intention preservation, compact operations, proven at scale.
- Cons: **needs a central server** to order operations, transformation functions are hard to get right, the server is a bottleneck, offline editing is hard.
- OT gives **eventual convergence**, not "everyone sees the same document immediately": each user sees their own edit at once and others' after propagation and transformation.

**Sequence CRDTs:**

- **Logoot/LSEQ:** give every character a unique, immutable, dense identifier (a path in a tree, e.g. (4,1,2)). Insert between two IDs by allocating a new one in between (go one level deeper if there is no room). No transformation, no index shifting. The document is the set of characters sorted by ID.
- **RGA (Replicated Growable Array):** each character references the character it was inserted after; concurrent inserts at the same spot are ordered by ID. Deletes are **tombstones**.
- Pros: decentralized (no server), offline-friendly, simpler to reason about mathematically.
- Cons: weaker intention preservation, metadata per character, tombstone accumulation, and **interleaving**: two users typing "students" and "friends" offline into the same gap of "Hi !" can converge to "Hi sftruideenndtss !" under LSEQ. RGA/Yjs avoid that particular case but not all; Fugue (2023) is the first with proven minimal interleaving.
- Interleaving does **not** mean a CRDT needs a central server: it still converges without one; the document just may not be what either user intended. OT can interleave too. Mitigations: batch keystrokes into words, live cursors, conflict highlighting.

## Likely essay angles

- Typical approach to consistency for mutable data (2021 Q2f).
- CAP and the choice per operation; consistency spectrum with examples.
- Lamport vs vector clocks; how to build causal consistency.
- OT vs CRDTs for collaborative editing (pros/cons above).

## Old exam questions

### Essay questions

- **2021 Q2f**: typical approach to consistency in distributed stores of mutable data.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1m / 2023 Q1j | Master–slave is used for scalability where fast, immediate consistency is required | **False**. Slaves give read scale but stale reads; immediate consistency funnels through the master. |
| 2022 Q1k | Immediate consistency for mutable data with sharding + replication commonly uses index node(s) to guide writes | **True** |
| 2023 Q1o / 2024 Q1o | Scaling out an eventually consistent system is helped by adding multi-command transactions | **False**. Transactions add coordination and hurt scale-out. |
| 2025 Q1g | A vector-clock system can ensure eventual consistency if RPC messages are mutable | **False**. Needs immutable (and idempotently applied) messages. |
| 2025 Q1h | CRDTs suffer interleaving and therefore need a central server | **False**. Interleaving can happen, but CRDTs converge without any server. |
| 2025 Q1i | Logical clocks can create a total order of events | **True**. Lamport timestamps with node-ID tie-break. |
| 2025 Q1k | It is possible to build a DS that is both consistent and available | **Depends**. Yes when there are no partitions; during a partition CAP forces a choice. |
| 2025 Q1l | OT guarantees all users always see the same state immediately | **False**. It converges eventually after operations propagate and are transformed. |

Related statements on database transactions (2025 Q1a–b) are in [01](01-fundamentals.md).

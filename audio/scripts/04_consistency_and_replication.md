# Episode four. Consistency, replication and synchronization.

Welcome to episode four. This one covers replication and sharding, what a write actually promises, the consistency models from linearizability down to best effort, the CAP theorem, logical and vector clocks, deletes and tombstones, anti-entropy, and conflict-free replicated data types, plus operational transformation for collaborative editing. Expect several true or false statements from this material, and probably an essay question too.

## Replication versus sharding

Sharding divides the data: each node holds a different part. It scales storage and throughput. Replication copies the data: each node holds the same data. It survives node loss and lets reads be served locally. Real systems usually combine both: shard the data, then replicate each shard. Replication keeps copies; synchronization reconciles them, and that is where the policy decisions live.

The 2026 lecture also mentions erasure coding. Instead of full copies, split data into k fragments and add m parity fragments, computed with X-OR or Reed-Solomon codes. Any k of the k plus m fragments rebuild the original. With four data and two parity fragments, one gigabyte takes one and a half gigabytes and survives two lost nodes, compared with three gigabytes for triple replication. The cost is that repair and reads need several fragments and updates rewrite parity. It suits large, cold, immutable objects, not small hot records.

## What "write" means

The lecture's opening example: Alice and Bob edit a shared study planner offline. When they reconnect, which title survives, can both edits to the note be kept, and can both bookings of the same room be confirmed?

A write can mean three different things. Saved on this device: in durable local storage, it survives an app crash. Acknowledged by the service: durably stored on the server, it survives losing the phone. Visible to others: other replicas have applied it. Until then, others may see the old state. Keep these apart when you reason about guarantees.

## Who may accept a write

Three topologies. Single leader: all writes go to one leader, which orders them, and followers receive the ordered updates. It is simple to reason about, but the leader is a bottleneck and a failover risk. Multiple leaders: several sites accept writes, for example one per region, or every offline phone. Concurrent writes are unavoidable, so a conflict policy is mandatory. Leaderless: a client writes to and reads from several replicas and waits for a quorum. If W replicas confirm each write and R replicas answer each read, and R plus W is greater than N, every read overlaps the latest write.

To make a write atomic across replicas you can use two-phase commit: the coordinator asks everyone to prepare, everyone votes, then the coordinator tells everyone to commit or abort. Its weakness, as in episode one, is that participants block if the coordinator crashes after they voted yes.

## Idempotency

Every retry protocol creates duplicates. If a message says "add one to the completed count" and the acknowledgment is lost, the retry adds one again, and the count is wrong. If instead it says "set task seven done equals true", applying it twice is the same as applying it once. That is idempotency. Any operation can be made idempotent by giving it a unique identifier and recording which identifiers have been applied, in the same transaction as the effect. The rule: either the operation is naturally idempotent, or you make it so with an identifier and a deduplication record. Never neither.

## Consistency models

A consistency model is a contract about what clients may observe before the replicas agree. Think of storage as a black box. Alice writes x equals one, gets OK, and reads x. Will she see one? It depends on the consistency model. Inside the box there may be replicas behind a load balancer. Her read may hit a replica that has not received the write yet. She might see one, then nothing, which is a non-monotonic read. Or Charlie might see Bob's reply "I'm in Sweden" before Alice's question "where are you Bob?", which violates causality.

From strongest to weakest:

Linearizability. The system behaves as if there were a single copy, and every operation takes effect at one instant between its start and its end, in real time. If an operation completed before mine started, mine must see it. It is needed wherever someone acts on a read: bookings, balances, "is this username taken", leader election. The lecture's test: can you place one point inside each operation's interval so that the resulting sequence explains every answer? If not, the execution is not linearizable.

Sequential consistency. There is one total order of all operations that respects every client's program order, but not real time. Everyone hears the same story, but not at the same time. Being late is allowed; seeing a different order is not. A Kafka partition, a replicated log, gives this. So does a blockchain: everyone eventually has blocks one, two, three, four in that order. It still requires agreeing on one global order, which costs coordination and is unavailable under partition.

Causal consistency. Writes related by happens-before are seen in that order by everyone; concurrent writes may be seen in different orders. If Bob read Alice's post before replying, everyone must see the post before the reply. Independent posts may appear in any order. This is the strongest model that stays available during partitions with local reads and writes. It is implemented by tagging writes with vector clocks and buffering a write until everything it depends on has been applied.

Session consistency, from the 2025 lecture, gives four guarantees within one client session: read your writes, monotonic reads, meaning you never go backwards, monotonic writes, meaning your writes apply in order, and writes follow reads.

Eventual consistency. If updates stop and messages get through, all replicas eventually converge. Before that, anything goes, and there is no deadline. Kademlia is the course example: STORE goes to the k closest nodes without waiting for everyone, and republishing makes replicas converge over time. Note that eventual consistency is a liveness property, not a safety property.

Best effort, or weak consistency. No promise at all. Nobody retransmits or reconciles. A temperature sensor dashboard or a game sending positions sixty times a second only cares about the newest value; late updates are discarded and gaps are interpolated or dead reckoned.

## CAP

The CAP theorem says that during a network partition, a system must choose between consistency and availability. C means linearizability, A means every request to a non-failing node gets an answer, P means the system keeps working despite lost messages. The proof is short: node A accepts a write, but cannot reach node B. A read at B can either answer with the old value, staying available but breaking consistency, or wait and refuse, staying consistent but unavailable.

CP systems, like etcd, Zookeeper and MongoDB in its default mode, choose consistency: correctness matters more, as in banking. AP systems, like offline-first apps and Kademlia, choose availability. A so-called CA system is only possible if partitions cannot happen, which means a single node, like one PostgreSQL instance. So the exam statement "it is possible to develop a distributed system that is both consistent and available" is depends: yes when there is no partition, but no system can guarantee both during one. The lecture adds: decide per operation, not per system. A note can be stale; a booking cannot.

## Clocks and ordering

Happens-before, written as an arrow, is Lamport's relation: a happens before b if they are on the same process in that order, or a is a send and b the matching receive, or by transitivity. If a happens before b, a might have caused b. If neither happens before the other, they are concurrent.

A Lamport clock is a counter. Increment it on every local event and send; on receive, set it to the maximum of your clock and the message's timestamp, plus one. If a happens before b, a's timestamp is smaller. But the reverse does not hold: a smaller timestamp does not prove causality. Can logical clocks create a total order of events? Yes: break ties with the process identifier, and you get a total order consistent with causality. That was a twenty twenty five question, and the answer is true.

A vector clock keeps one counter per process. Comparing two vectors tells you whether one event happened before the other, or whether they are concurrent, which a Lamport clock cannot. That is why vector clocks are used for causal delivery and conflict detection. A twenty twenty five statement claimed vector clocks ensure eventual consistency if messages are mutable. False: the whole approach relies on immutable messages and timestamps; if messages can be changed after being sent, replicas cannot agree on what happened. Immutable messages are a key paradigm in distributed systems.

## Deletes

Deleting is not just another write. If A deletes X while B is offline, then when B reconnects, B's copy looks like data A is missing, and a repair process may copy it back. That is resurrection. A delete can also race with a concurrent offline edit, and a reader at a lagging replica may still see the deleted item. The root problem is that absence carries no information: "I never had X" and "I deleted X" look the same.

The fix is a tombstone, a record saying "X deleted at version v", which wins over older copies. Tombstones are kept as long as old updates might still arrive and are garbage collected only after every replica has seen them, or after a retention window beyond which offline clients must fully resynchronize.

## Synchronization and anti-entropy

With a single leader, followers replay the leader's log from their last position. Raft does this with the previous log index and term in each AppendEntries, so gaps are detected, never skipped. If a follower is too far behind and the log has been compacted, it loads a snapshot and replays the tail.

Without a single log, replicas use anti-entropy: periodically each replica picks a peer, compares state, and both exchange whatever the other lacks. Comparing everything is expensive, so systems like Amazon's Dynamo use Merkle trees: hash each key, then hash pairs of hashes up to a root. If the roots match, replicas are identical. If they differ, descend only into differing subtrees, and fetch only the differing keys. Because merges are idempotent, repeating an exchange is harmless, and with random peers, updates reach everyone in order log n rounds, like an epidemic.

## CRDTs

Conflict-free replicated data types make agreement follow from the data type itself. Every replica applies updates locally and immediately, and the type defines how to merge any two states. If the merge is commutative, associative and idempotent, then replicas that have seen the same updates hold the same state, regardless of order, batching or duplicates. Commutativity handles reordering, associativity handles batching, and idempotency handles duplicates. No locks or consensus are needed. This is called strong eventual consistency.

Examples: a grow-only counter keeps one count per replica and merges by taking the maximum per replica. For a single value, a last-writer-wins register picks a winner by a total order such as a counter plus replica identifier, which is deterministic but silently loses one edit. A multi-value register keeps both concurrent values and lets the user resolve the conflict.

## Collaborative editing: OT versus sequence CRDTs

Locking a document per keystroke is far too slow. Collaborative editors apply changes locally, sync in the background, resolve conflicts automatically, and try to preserve user intent.

Operational transformation, OT, as in the Jupiter system behind early Google Docs, adjusts the position of incoming operations to account for concurrent ones. If Alice deletes the A in A B C D while Bob inserts X after A, Bob's insert must be shifted one position left when applied at Alice's side. OT usually relies on a central server to order operations. It does not guarantee everyone sees the same state immediately; it guarantees convergence once all operations are exchanged. So the twenty twenty five statement "OT guarantees all users always see the same document state immediately" is false.

Sequence CRDTs, like Logoot and LSEQ, give every character a unique, immutable position identifier from a dense tree, so a new character can always be placed between two existing ones without shifting anything. Merge is set union sorted by identifier. They need no central server. Their known weakness is interleaving: if two users offline type different words into the same gap, the merged document may mix their letters into gibberish. Every replica converges, but intent is lost. Newer algorithms like Fugue minimize this. So the statement "CRDTs suffer from interleaving and thus require a central server" is false: interleaving is real for some sequence CRDTs, but the whole point of CRDTs is that no central server is needed.

## Transactions and ACID

Two more twenty twenty five traps. "If every low level write is atomic, all concurrent transactions are automatically serializable": false. Atomic individual writes do not prevent interleaving between the reads and writes of different transactions; you need concurrency control such as locking or multi-version schemes. "ACID requires that all commands inside a transaction finish before another transaction can start": false. Isolation requires the result to be as if transactions ran one at a time, but databases execute them concurrently, using locks, and resolve deadlocks with timeouts and rollbacks. Relational databases use a local transaction log to survive losing their RAM cache, to support client-defined transactions, and to provide ACID. NoSQL stores typically give up multi-item transactions in exchange for scale and lock-free operations.

## Quick review

Sharding scales, replication protects. Linearizable, sequential, causal, eventual, best effort, from strongest to weakest. CAP: during a partition, pick consistency or availability, per operation. Lamport clocks give a total order with tie-breaking; vector clocks detect concurrency. Tombstones prevent resurrection. Merkle trees find differences cheaply. CRDT merges are commutative, associative and idempotent. OT needs a server and converges eventually; sequence CRDTs need no server but can interleave.

That is the end of episode four. The final episode is orchestration, scheduling and Kubernetes.

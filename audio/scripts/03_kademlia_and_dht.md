# Episode three. Distributed hash tables and Kademlia.

Welcome to episode three. Kademlia is your lab assignment, and it shows up on the exam both as true or false statements and as long questions about testing and verifying your implementation. In this episode we cover what a distributed hash table is, consistent hashing, Chord, Kademlia's XOR metric, k-buckets, node lookup, joining, storing and republishing, and finally how to convince yourself that a Kademlia implementation is correct at scale.

## What a DHT is

A regular hash table maps keys to values: put a key and value in, give it a key, get the value back. A distributed hash table, or DHT, does the same, but the table is spread over many networked computers called nodes. The reasons are the usual ones for distributed systems: scale and performance, availability and fault tolerance, and decentralization, meaning no central server.

A DHT is also an overlay network. An overlay is a logical network built on top of an existing one, here the internet. Each node has an identifier in the overlay, and neighbors in the overlay can be physically far apart. So a DHT is an overlay network with built-in key value storage. The twenty twenty five exam statement "a DHT is an overlay network with additional data storage functionality" is true. The overlay could also be used for other things, like routing messages or finding peers.

A DHT must handle churn, nodes joining and leaving all the time, often without warning.

## Data in a DHT

DHTs work best for immutable data that is read often and written rarely: content addressed files, where the key is the hash of the content, peer lists in BitTorrent, IPFS style lookups, public keys, and block headers. If the content never changes, any copy is a correct copy, ordering does not matter, and more copies only improve availability. DHTs typically store immutable data objects, but they do not provide an immutable, ordered history of updates. They give eventual consistency, not consensus.

## From hash tables to consistent hashing

The lecture derives DHTs from ordinary data structures. A normal hash table maps a key to a bucket with the key modulo the number of buckets. Distribute that over nodes, and each bucket lives on a different node. The problem appears when a node joins or leaves. With modulo hashing, changing the number of buckets changes almost every key's position, so almost all the data must move. Over a network, that is unacceptable.

Consistent hashing fixes this. Hash both nodes and keys into the same large identifier space, picture it as a ring, and give each key to the first node at or after the key's position, its successor. When a node joins or leaves, only the keys between it and its neighbor move. On average only about one over N of the keys move, where N is the number of nodes. That is the important property of consistent hashing. On the twenty twenty five exam, "consistent hashing means only a constant fraction of keys are moved" is best answered as true or depends: it is a fraction of about one over N, the keys of the affected node, not a fixed constant like a half.

Two other points. Consistent hashing places data by hash, not by location, so it does not give short round trip times. The repeated exam statement "data storage based on consistent hashing places data so that short round trip times are obtained" is false. And load can be uneven, because random positions give some nodes bigger ranges. Virtual nodes, each machine taking several positions on the ring, even this out.

## Chord

Following that idea all the way gives Chord. Nodes sit on a ring, and each key belongs to its successor. If every node only knew its successor, a lookup would walk the ring in order N steps. Chord adds a finger table: node n remembers the successor of n plus one, n plus two, n plus four, n plus eight, and so on, doubling each time. Only about log N of those are distinct nodes. Each hop at least halves the remaining distance, so lookup takes order log N hops. For fault tolerance, each key is replicated on the next few successors.

Compared with a fully replicated store, a DHT is decentralized and scales better than a ring where every node knows every other node, which is what Cassandra style consistent hashing does. In Cassandra every node knows the whole ring, so you can reach data in one hop, but membership information must reach everyone. A DHT keeps only logarithmic state per node and handles far more nodes. That makes "a DHT has better scaling properties than immediate consistent hashing as used in Cassandra" true in terms of number of nodes, at the cost of more hops per lookup.

## Kademlia's identifiers and the XOR metric

Kademlia uses one hundred and sixty bit identifiers for both nodes and keys. Its key idea is the distance metric: the distance between two identifiers is their bitwise exclusive or, X-OR, interpreted as an integer. If two identifiers share a long common prefix, the X-OR result starts with many zeros, so the distance is small. If the very first bit differs, the distance is large.

X-OR has nice properties. The distance from a node to itself is zero. It is symmetric: the distance from A to B equals the distance from B to A, so nodes learn useful contacts from the requests they receive. It obeys the triangle inequality. And it is unidirectional: for any point and any distance, exactly one identifier lies at that distance, so lookups for the same key from different starting points converge along the same paths, which helps caching.

A key value pair is stored on the k nodes whose identifiers are closest to the key. In the paper k is twenty; in the lab examples it is often smaller, like three.

## The routing table and k-buckets

Each node keeps a routing table of k-buckets. Bucket i holds up to k contacts whose distance from the node is between two to the power i and two to the power i plus one. Equivalently, bucket i holds nodes that share exactly a certain prefix length with you and differ at the next bit. So there is one bucket per bit of the identifier space, one hundred and sixty in total.

That answers a recurring exam trap. Does the number of k-buckets depend on the number of active nodes? False. It depends on the size of the address space. In the full tree based version, buckets are split as they fill up, so the number of buckets in use can change dynamically, and the statement "the number of k-buckets can be dynamically changed" is true for that variant. For the lab, the simplified version, a fixed array of one hundred and sixty buckets accessed by index, is enough.

Half of all possible identifiers fall in the farthest bucket, a quarter in the next, and so on. So a node knows many nodes close to itself and only a few far away, but always at least some in every direction where nodes exist. That is what makes logarithmic lookup work.

Buckets are kept in least recently seen order. When you hear from a node, you move it to the tail of its bucket. If the bucket is full, you ping the least recently seen node at the head. If it answers, you keep it and drop the newcomer; if not, you evict it and insert the newcomer. Kademlia prefers old nodes because nodes that have been up a long time are statistically likely to stay up. A side effect is resistance to flooding attacks, since an attacker cannot push out long-lived honest contacts.

## The four RPCs

Kademlia has four remote procedure calls. PING checks whether a node is alive. STORE asks a node to store a key value pair. FIND_NODE takes a target identifier and returns the k closest nodes the recipient knows. FIND_VALUE works like FIND_NODE, except that if the recipient holds the value, it returns the value instead.

## Node lookup

Node lookup is the central algorithm. To find the k closest nodes to a target, a node picks the alpha closest contacts from its own routing table, alpha usually being three, and sends them FIND_NODE in parallel. Each reply contains closer contacts. The node keeps a shortlist sorted by distance, and keeps querying the closest contacts it has not yet asked. When a round produces no node closer than the closest already seen, it sends queries to all of the k closest nodes it has not asked yet. The lookup ends when the k closest nodes it knows have all responded.

Each step roughly halves the distance, at least one more bit of shared prefix, so a lookup takes order log n steps, where n is the number of nodes. The repeated exam statements: "Kademlia routing is done in linear time" is false. "Kademlia routing is done in constant time" is false. "Kademlia search is in the worst case done in order log n time" is true, under the assumption that routing tables are reasonably populated. "Kademlia search is order log n but filling the table requires order n search" is false: tables fill up as a side effect of normal traffic and a few lookups when joining.

Timeouts are important. Parallel queries with alpha mean that one slow or dead node does not stall the lookup, and unresponsive nodes are dropped from consideration.

## Joining, storing and republishing

To join, a new node needs one contact already in the network, a bootstrap node. It inserts that contact in the right bucket, then performs a node lookup for its own identifier. This fills its buckets with nodes close to itself and, by symmetry, announces it to those nodes. Finally it refreshes buckets farther away by looking up a random identifier in each bucket's range.

To store, a node does a lookup for the key, then sends STORE to the k closest nodes. To retrieve, it does a value lookup that stops as soon as any node returns the value. Kademlia also caches the value at the closest node on the path that did not have it, which spreads popular keys.

Data must survive churn. In the original design, the original publisher republishes every twenty four hours, nodes holding a value re-store it to the current k closest nodes every hour, and values expire after twenty four hours without refresh. The 2026 slides phrase it as: publishers republish hourly, holders check hourly and push to any of the k closest that lack it, and data expires after twenty four hours. This republishing is what gives eventual consistency: replicas may disagree for a while, but converge if updates stop.

A practical question from the lecture: how many acknowledgments should STORE wait for? After one acknowledgment it is fast, but the value may exist on only one node. After all k, one dead node blocks the write. A majority is the sensible middle: durable enough, and still available under churn.

## Concurrency in your implementation

Your Kademlia node is concurrent: it answers incoming requests while running its own lookups. The classic bug is a data race on the routing table. The lecture recommends avoiding raw mutexes where you can, and instead using the actor pattern: one goroutine owns the routing table, and other goroutines send it requests over channels. The inbox serializes all access, so there is no shared mutable memory and no data race. This is the channel abstraction the twenty twenty five exam asked about: channels decouple sender and receiver, make communication explicit, and the same message passing style works locally between goroutines and globally between nodes over the network.

## Verifying correctness at scale

This was the whole extra exam in twenty twenty five, and six points on the regular one. The question: if generative AI helped write your code, how do you know it is correct?

Start by defining correctness. Lookup correctness: a FIND_NODE for a target returns the true k closest live nodes, or nearly so. Storage correctness: after STORE, a FIND_VALUE from any node returns the value with high probability. Routing table invariants: every contact is in the bucket matching its distance, no bucket exceeds k, and a node never stores itself. Performance: lookups complete in about log n hops. Robustness: these still hold while nodes join and leave.

Then build evidence in layers. Unit tests for the X-OR distance, bucket index calculation, and bucket eviction. Concurrency checks, for example running tests with Go's race detector. Then simulation: spin up hundreds or thousands of nodes in one process, with an in-memory network that can drop or delay messages, so tests are fast and repeatable with a fixed random seed. Because the test harness knows every node, it can compute the ground truth by brute force: sort all node identifiers by X-OR distance to the target and take the first k. Then compare.

In pseudo code: create a thousand nodes and join each through a random existing node. Then, for a hundred random targets, pick a random starting node, run its lookup, compute the true k closest by sorting all nodes by distance, and assert that the lookup's answer matches, or that the overlap is above, say, ninety percent. Record the number of hops and assert that it stays near log base two of n. Then kill twenty percent of nodes at random, wait for refresh, and check that stored values are still found. Finally, run the same test in Docker containers to include real networking.

Finally, reflect on what remains uncertain. Tests sample behavior; they do not prove it. A simulation can miss timing issues that only appear on real networks, rare interleavings can survive many runs, and generative AI can produce code that looks plausible and passes the tests it also wrote. So review the generated code against the paper, write the test oracles yourself, and treat the results as statistical confidence, not proof.

## Quick review

DHTs are overlay networks with storage, can be completely decentralized, and suit immutable data. Consistent hashing moves only about one over N of the keys when membership changes, but does not optimize latency. Kademlia uses X-OR distance, one hundred and sixty bit identifiers, one k-bucket per bit of address space, the four RPCs PING, STORE, FIND_NODE and FIND_VALUE, parallel lookups with alpha equals three, and order log n hops. Republishing gives eventual consistency, not strong consistency.

That is the end of episode three. Next episode: consistency models and replication.

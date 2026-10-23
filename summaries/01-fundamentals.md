# 01 · Distributed systems fundamentals

Sources: [2025 L1 Introduction (Olov)](../D7024E%20Lecture%20slides/D7024E_L1_Introduction.pdf), [2026 L1 Course introduction](../D7024E_Lectures_2026/D7024E_L1_Course_Introduction_V2.pdf), [L3 Communication, time and ordering](../D7024E%20Lecture%20slides/D7024E_L3_communication_and_protocols.pdf). Database and security material comes mostly from older lectures that are not in the repo, so those sections lean on standard textbook knowledge.

## Core ideas

### What a distributed system is

A collection of autonomous nodes that cooperate by **passing messages over a network** and look to the user like one coherent service.

- **No shared memory** and **no common clock**. Each node has its own RAM and its own (drifting) clock.
- Communication time is not negligible. Luleå to Sydney is about 300 ms round trip; a remote call is roughly a million times slower than a local one.
- Nodes are heterogeneous (speed, storage, OS) and loosely coupled.
- You can never tell a crashed node from a slow node or a lost message. You design for it with timeouts, retries, replication and redundancy.
- Lamport: "A distributed system is one in which the failure of a computer you didn't even know existed can render your own computer unusable."

**Distributed vs decentralized.** Decentralized means nobody is in charge (no special node, no single owner). Every decentralized system is distributed, but most distributed systems (a cloud, Kubernetes, a database cluster) are centrally administered.

**Cluster vs geo-distributed.** A cluster sits in one datacenter: fast, reliable LAN, can assume near-synchrony, but one site is a shared failure domain. Geo-distributed systems span continents: survive a site loss and sit close to users, but have high and variable latency, partitions are realistic, and strong consistency becomes expensive (every coordinated write pays a WAN round trip).

### Why distribute at all

Performance/cost ratio, resource sharing, reliability and availability, scalability (add or remove nodes), data near the user, modularity. The 2026 intro frames it as: it already is distributed (phones talk to phones); one machine will crash; light is slow; the web does not fit on one disk.

### Architectures (2026 L1)

| Architecture | Plus | Minus |
|---|---|---|
| Client–server | Simple, one source of truth | Single point of failure, scaling ceiling |
| Peer-to-peer | No SPOF, capacity grows with users | Churn, discovery, NAT traversal, trust |
| Cloud-native microservices | Elastic, managed | Lock-in, cost at scale |
| Serverless (FaaS) | Zero ops, scale to zero | Cold starts, state must live elsewhere |
| Event-driven | Decoupled in space and time | Hard to trace; ordering and duplicates |
| Federation (e-mail, eduroam) | No central owner | Evolves slowly; spam/trust is everyone's problem |

Why client–cloud won the 2000s: clients behind NAT/firewalls can always call *out*, so a server on a public address is easy to reach while peer-to-peer needs NAT traversal (see [06](06-messaging-nat.md)). Business reasons matter too: providers can see what customers do.

### System models (2026 L3)

Pick one of each before you reason about any algorithm. If the assumptions are wrong, all bets are off.

- **Network:** reliable links (delivered iff sent, may reorder) · fair-loss links (may lose, duplicate, reorder; retrying eventually succeeds) · arbitrary links (an adversary can eavesdrop, modify, drop, spoof, replay).
- **Nodes:** crash-stop · crash-recovery (loses RAM, comes back) · omission (silently drops messages) · Byzantine (arbitrary, possibly malicious).
- **Timing:** synchronous (known bound on latency and speed) · partially synchronous (asynchronous for finite periods, synchronous otherwise) · asynchronous (no bounds at all).

Internet systems are asynchronous or partially synchronous. Synchronous models are realistic inside embedded systems.

### Scalability and high availability

- **Horizontal scalability (scale out):** add more nodes to get more total capacity. **Linear** horizontal scalability means capacity grows proportionally with the number of nodes. Requires that work can be partitioned (sharding, stateless front ends) without a shared bottleneck. **Vertical scaling (scale up):** buy a bigger machine until there is none.
- Properties people mean by "horizontally scalable": throughput grows with nodes, latency stays acceptable as load grows, nodes can be added/removed without downtime or redesign (scaling transparency), and cost grows roughly linearly.
- Things that do **not** scale out: anything that needs every node to agree on every operation (global consensus, a blockchain where everyone validates everything, a single leader for writes).
- **High availability:** the service keeps answering despite failures. Achieved by redundancy (no single point of failure), **replication** of state or **stateless** front ends, failure detection (heartbeats, timeouts) and **fail-over** to a healthy replica. Seamless fail-over needs either replicated state or stateless servers; otherwise in-flight session state is lost.
- Example: web front ends are stateless behind a load balancer or DNS; persistent state lives in a replicated database with a leader and followers; if the leader dies, a follower is promoted (via consensus, see [02](02-consensus.md)).

### Load balancing with DNS and dispatchers (2025 L1)

- **Round-robin DNS:** DNS returns a list of IPs and rotates it. Coarse and load-insensitive; clients may fail over to the next address, slowly (tens of seconds) and with session state lost.
- **DNS hosting with health checks:** several addresses are registered, only healthy ones are advertised with a short TTL; the provider heartbeats/pings the servers and stops advertising a dead one. Gives reasonably quick fail-over controlled by the server side.
- TTL trade-off: long TTL means slow reaction; short TTL means more DNS load.
- **Dispatcher-based:** a load balancer rewrites packets (single or double rewriting) or redirects HTTP, so the service appears as one IP. Efficient for clients, but the dispatcher must itself be redundant.

### Transparencies

Access, location, concurrency, replication, failure, mobility, performance and scaling transparency: each hides one aspect of distribution from users and programmers.

### Processes, threads and concurrency (2025 L1)

- Processes have separate protected address spaces. A **process switch** changes address space, so the TLB is flushed and caches go cold: expensive. A **thread switch** within a process keeps the address space: much cheaper. Trade-off: processes give isolation and security (a crash or bug cannot corrupt another process's memory); threads give speed and easy sharing but every shared variable is a race waiting to happen. See [10](10-go-concurrency.md) for the full 2025 Q4e answer.
- **Race condition:** the result depends on the interleaving. **Deadlock** needs all four Coffman conditions: mutual exclusion, hold-and-wait, no preemption, circular wait.
- Coarse-grained locking: simple, little parallelism. Fine-grained: fast but easy to get wrong.
- Inside one machine nodes may synchronize with shared memory and semaphores. **Between** nodes there is no shared memory, so coordination happens by messages (or a lock service built on messages).

### Mutability and immutability: the three abstractions (2024 Q2a)

Olov's recurring theme: immutability makes distribution easy, mutability needs coordination. Most distributed systems build on:

1. **Immutable messages.** A message, once sent, never changes. Pub-sub, queues, RPC, gossip and actors all pass immutable messages that can be copied, retried and cached freely. Delivery can be reliable or unreliable.
2. **Immutable data objects**, usually named by their content hash (content addressing). DHTs, IPFS, BitTorrent and blockchain blocks store objects that never change, so any replica is as good as any other and no coordination is needed.
3. **Mutable state built from an immutable, ordered log of commands.** Shared mutable state (a database, a configuration store, an account balance) is represented as a replicated, append-only command log. Everyone applies the same commands in the same order, so they reach the same state. Agreeing on that order is what consensus (Raft, Paxos, Zab) or a blockchain does.

Idempotent operations ("set x = 5" rather than "add 1") pair naturally with immutable messages because a duplicate is harmless.

### Databases: transaction logs, ACID, deadlocks, NoSQL

- **ACID:** Atomicity (all or nothing), Consistency (invariants hold), Isolation (concurrent transactions behave as if serial), Durability (committed data survives crashes).
- **Transaction (write-ahead) log:** a local, sequential, durable log of commands. Lets the database keep its working set in a RAM cache, recover after a crash (redo committed, undo uncommitted), support client-defined multi-statement transactions, and roll back aborted ones. It is a local durability mechanism, not a consensus mechanism.
- **Serializability** means concurrent transactions produce a result equivalent to *some* serial order. It does not require transactions to run one at a time; concurrency control (two-phase locking, MVCC, optimistic validation) lets them interleave. Atomic individual writes are not enough: two transactions can each do atomic reads and writes and still interleave into a non-serializable result (lost update).
- **Deadlocks** happen when transactions lock rows in different orders. Databases detect them (wait-for graph cycle, or a timeout) and resolve them by aborting a victim and rolling it back using the log. Detection and rollback cost performance.
- **NoSQL** (key-value, document, wide-column) stores usually give up client-defined multi-item transactions and cross-item ACID in exchange for lock-free operations, automatic sharding, replication and eventual consistency. **Document databases** store an aggregate (an order with its line items) together, so they have good data locality compared to normalized relational tables that need joins.

### Security

- Dimensions: **confidentiality** (only intended readers), **integrity** (no undetected modification), **availability** (service works), plus **authenticity** (who sent it) and **non-repudiation** (sender cannot deny it).
- **Symmetric crypto** (AES): one shared key, fast, but key distribution is hard. **Asymmetric crypto** (RSA, ECC): public/private key pair, slow, solves key distribution and enables signatures.
- **PGP** is hybrid. To encrypt: generate a random one-time symmetric session key, encrypt the payload with it, encrypt the session key with the recipient's public key. To sign: hash the message and sign the hash with the sender's private key. Symmetric keys are used because asymmetric encryption of large payloads is slow and size-limited; a fresh session key per message also limits what one broken key exposes.
- PGP establishes trust with a **web of trust** (users sign each other's keys), not with certificate authorities. **CAs** (used by TLS/X.509) are trusted third parties that certify that a public key belongs to a name.
- **IPsec** secures at the network layer and can build encrypted tunnels (VPNs). TLS secures at the transport layer.
- What PGP covers: encryption gives confidentiality; signing gives integrity, authenticity and non-repudiation; sign-and-encrypt gives all of those. PGP never gives availability.

## Likely essay angles

- **Horizontal scalability (2018 Q2a):** define scale-out vs scale-up; properties: throughput grows (ideally linearly) with nodes, partitionable work, no central bottleneck, elastic add/remove, scaling transparency; say what breaks it (shared state, global consensus, hot keys).
- **High availability and fail-over (2018 Q2b, 2022 Q2a):** redundancy, replication or statelessness, failure detection by heartbeats/timeouts, automatic fail-over (DNS health checks, load balancer, leader election). Example: stateless web tier behind a health-checking load balancer with a Raft/ZooKeeper-backed primary database that promotes a replica.
- **Cluster vs geo-distributed trade-offs (2018 Q2c):** latency, bandwidth, failure correlation, consistency cost, partition likelihood, regulatory/data locality, cost.
- **PGP (2020 Q2d, 2022 Q2e):** hybrid crypto explanation above; map each usage case (sign only / encrypt only / both) to confidentiality, integrity, authenticity.
- **Three abstractions (2024 Q2a):** the list above.

## Old exam questions

### Essay questions

- **2018 Q2a–c**: horizontal scalability, high availability with example, cluster vs geo-distributed.
- **2020 Q2d**: why PGP uses symmetric keys too.
- **2022 Q2a**: high availability and fail-over.
- **2022 Q2e**: security dimensions and PGP usage cases.
- **2024 Q2a**: three abstractions related to mutability and immutability.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1a | Communication in geo-distributed systems is typically synchronous | **False**. Unbounded latency and loss: asynchronous. |
| 2018 Q1b | P2P is cost effective w.r.t. needed service capacity | **True**. Every peer adds capacity; no provider pays for servers. |
| 2018 Q1f | Relational DBs have a transaction log to handle loss of RAM cache state | **True** |
| 2018 Q1u | PGP uses key pairs to encrypt/exchange symmetric keys | **True** |
| 2018 Q1v | IPsec can create encrypted tunnels | **True** |
| 2019 Q1a | A distributed system is always scalable | **False**. Global consensus, central bottlenecks, etc. |
| 2019 Q1b | Each node has its own local memory and clock | **True** |
| 2019 Q1g / 2020 Q1j | SQL transaction log is used locally for transactions and RAM cache | **True** |
| 2019 Q1h / 2020 Q1k | SQL needs a transaction log to handle and resolve deadlocks | **Depends**. Deadlocks are *detected* by the lock manager (wait-for graph or timeout), not by the log; the log is needed to *roll back* the chosen victim. |
| 2019 Q1n / 2020 Q1q | DNS hosting can fail over by heart-beating servers and advertising only live ones | **True** |
| 2019 Q1u | PGP uses key pairs to encrypt the payload | **False**. The payload is encrypted with a symmetric session key. |
| 2019 Q1v / 2020 Q1v | CAs certify ownership of public keys | **True** |
| 2020 Q1a | Nodes in a DS synchronize critical regions with semaphores | **False**. No shared memory; coordinate by messages or a lock service. |
| 2020 Q1b | Nodes share RAM and clock | **False** |
| 2020 Q1c | IPC can be via shared memory or message transfer | **True** (shared memory locally, messages remotely) |
| 2020 Q1d / 2021 Q1f / 2022 Q1f | Linear horizontal scalability: more nodes adds total performance | **True** (proportionally) |
| 2021 Q1a | Distributed systems must be decentralized | **False** |
| 2021 Q1b | DS should use some degree of replication | **Depends**. Needed for availability/fault tolerance, not for distribution itself. |
| 2021 Q1c | Shared state protected across nodes with semaphores | **False** |
| 2021 Q1d | Nodes in a cluster are spread geographically | **False** (one datacenter) |
| 2021 Q1e / 2022 Q1e | Nodes communicate and coordinate by message passing | **True** |
| 2021 Q1h | Hashing time spreads unpredictably | **False**. Deterministic, linear in input length; the *output* looks random. |
| 2021 Q1m | Immutability complicates distributed design | **False**. It simplifies it (no coordination for copies). |
| 2021 Q1n | DNS can be used for fail-over across web servers | **True** |
| 2021 Q1o | SQL databases need to handle and resolve deadlocks | **True** |
| 2021 Q1t | PGP requires CAs | **False**. Web of trust. |
| 2022 Q1a | Multiple nodes with no common clock | **True** |
| 2022 Q1b | Seamless fail-over needs replication or stateless nodes | **True** |
| 2022 Q1c | Scalability means adding nodes without affecting performance | **Depends/False**. Scalability means performance keeps up as load grows; adding nodes should *improve* capacity, not merely leave it unchanged. |
| 2022 Q1j | Immutability and idempotence make decentralized design hard | **False**. They make it easier. |
| 2022 Q1m | SQL DBs resolve deadlocks from faulty clients, which hits performance | **Depends**. Deadlocks come from normal concurrent transactions locking in different orders, not only faulty clients; detection and rollback do cost performance. |
| 2022 Q1r | Decentralized implies distributed, not the other way around | **True** |
| 2022 Q1s | PGP's random symmetric key makes cracking harder | **Depends**. Main reason is speed; a fresh per-message key does limit exposure. |
| 2023 Q1b | DBs need a local transaction log for RAM loss, client transactions and ACID | **True** |
| 2023 Q1c / 2024 Q1c | Deadlocks resolved by timeouts and rolling back | **True** |
| 2023 Q1d | NoSQL provides ACID across any pieces of data | **False** |
| 2023 Q1h | DNS round robin advertises several IPs for a URL | **True** |
| 2023 Q1l | Document databases give good data locality | **True** (aggregates stored together) |
| 2024 Q1d | NoSQL trades client-defined transactions for lock-free operations | **True** |
| 2024 Q1h | DNS provider heartbeats web servers and drops unhealthy ones | **True** |
| 2024 Q1l | NoSQL gives better data locality than relational | **Depends/True**. Document and wide-column stores keep aggregates together; a key-value store with scattered keys does not. |
| 2024 Q1p | PGP uses only asymmetric keys in normal operation | **False** |
| 2024 Q1q | Ad-hoc proactive routing knows an end-to-end path before transmitting | **True**. Proactive (table-driven, e.g. OLSR) keeps routes up to date continuously; reactive (AODV) discovers on demand. |
| 2025 Q1a | If every low-level write is atomic, concurrent transactions are serializable | **False**. Lost updates and write skew still happen; you need concurrency control. |
| 2025 Q1b | ACID requires a transaction to finish before another starts | **False**. Isolation needs an equivalent serial order, not serial execution. |

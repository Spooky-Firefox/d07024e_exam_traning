# 06 · Messaging and NAT traversal

Sources: [L3 Communication, time and ordering (Carl)](../D7024E%20Lecture%20slides/D7024E_L3_communication_and_protocols.pdf), [2025 L1 Introduction (Olov)](../D7024E%20Lecture%20slides/D7024E_L1_Introduction.pdf) (communication primitives), [2026 L8 Orchestration](../D7024E_Lectures_2026/D7024E_L8_Orchestration.pdf) (brokers behind NAT). Pub-sub, Kafka, SRM and STUN/TURN were taught in Olov's earlier lectures that are not in the repo, so those sections use standard references (Kafka docs, RFC 8489 STUN, RFC 8656 TURN, Floyd et al. 1997 SRM).

## Core ideas

### Remote IPC, marshalling and RPC

- Locally, processes can share memory. Over a network there is no shared memory, so you must: package the data, transmit, unpack.
- **Marshalling (serialization):** convert in-memory data into a compact, **platform-independent** byte format; unmarshalling reconstructs it. It is reversible (not hashing). Essential for RPC between heterogeneous platforms (different languages, endianness, word sizes). Still central today: Protobuf, Cap'n Proto, JSON, gRPC. Client–cloud systems need it just as much as P2P.
- **Protobuf:** schema (`.proto`), generated code, compact binary, fast, strongly typed, backward/forward compatible.
- **RPC:** call a procedure in another address space as if it were local. Client stub marshals arguments → network → server stub unmarshals → calls function → marshals result → back. Examples: gRPC, Java RMI, JSON-RPC, CORBA. The lab implements PING, STORE, FIND_NODE, FIND_VALUE over UDP by hand. Challenges: latency, **partial failures** (did the call run?), versioning.

### Communication primitives (Olov, 2025 L1)

- **Synchronous** send/receive: sender blocks until the receiver has the data (a **rendezvous/handshake**). The send–receive pair is one atomic event, which makes reasoning easy, but it waits a full round trip. Common inside embedded/tightly coupled systems.
- **Asynchronous**: the sender returns once data leaves its buffer; much better performance when round-trip times are large. Internet and geo-distributed systems are asynchronous, so rendezvous handshaking is not typical there.
- Blocking vs non-blocking is a separate axis (does the call return before the operation completes).
- **Direct communication** (RPC, request/reply): sender knows the receiver, both alive at the same time, tightly coupled. **Indirect communication** (via an intermediary): **space decoupling** (sender does not know receivers) and **time decoupling** (they need not exist at the same time). Examples: group communication, pub-sub, message queues, tuple spaces.

### Group communication and broadcast

- Best-effort vs **reliable broadcast** (non-faulty nodes deliver every message, using retransmission).
- Ordering guarantees: **FIFO** (per-sender order), **causal** (happens-before order), **total order** (everyone delivers in the same order; equivalent to consensus), FIFO-total.
- **Gossip:** each node periodically sends what it knows to a few random peers; information spreads like an epidemic in O(log N) rounds. No coordinator, scalable, robust, probabilistic and eventually consistent.
- **SRM (Scalable Reliable Multicast):** receivers do not ACK. A receiver that detects a gap multicasts a **NACK** (repair request) after a **random delay**, and suppresses its own NACK if it hears someone else's first; *any* member that has the data can answer the repair, also after a random delay. Avoids the ACK implosion of positive acknowledgements. In the worst case (badly tuned timers, many receivers losing the same packet) you can still get a burst of NACKs/repairs.

### Messages are immutable

A key paradigm (Olov): messages are **immutable** values. Once sent they never change, so they can be copied, retried, cached, logged and reordered safely. Delivery can be reliable or unreliable. Mutable shared state is what needs coordination; immutable messages do not.

### Pub-sub vs message queues (2023 Q2a)

| | Publish–subscribe | Message queue |
|---|---|---|
| Pattern | one-to-many: every subscriber of a topic gets every message | point-to-point: each message is consumed by **one** of possibly many consumers (competing consumers) |
| Addressing | topics/channels/streams; publisher does not know subscribers | named queue; producer does not know which worker takes it |
| Lifetime | message delivered to all current (or durable) subscribers; in log-based systems (Kafka) retained for a period and re-readable | message removed once acknowledged by the consumer (read once) |
| Use | events, notifications, fan-out, event-driven microservices | work distribution, load levelling, task queues |
| Examples | Kafka topics, Google Pub/Sub, MQTT, Redis pub/sub | RabbitMQ queues, SQS, Celery |

Properties of the **messages**: immutable, self-contained, usually carry an ID and timestamp, delivered at-least-once in most systems (so consumers must be **idempotent** or deduplicate by ID), ordered only within a partition/queue, and decoupled from both sender and receiver lifetimes.

Pub-sub and queue semantics are **not the same**. Kafka combines them: within a **consumer group** a partition is read by one consumer (queue semantics); different groups each get all messages (pub-sub semantics).

**A pub-sub service is itself a scalable distributed system:** it shards (partitions) topics across brokers and replicates each partition to a subset of brokers. Most pub-sub services are **distributed but not decentralized**: brokers are run by one operator, and a broker is an intermediary.

### Kafka

- A **distributed, partitioned, replicated commit log**. A topic is split into partitions; each partition is an append-only, ordered log stored on several brokers (one leader, followers in the in-sync replica set).
- Producers append; consumers track their own **offsets** and can re-read. Messages are retained for a configured time, not deleted on read.
- Ordering is guaranteed **within a partition** (sequential consistency per partition, 2026 L7), not across partitions.
- Kafka **does need internal global coordination**: which broker leads which partition, cluster membership, topic configuration, controller election. Historically via **ZooKeeper**, now via **KRaft** (Kafka's own Raft-based controller quorum). So "Kafka relies on global consensus to keep track of responsibilities and leadership" is true, and "Kafka is completely distributed with no internal global synchronization" is false.

### NAT and firewall traversal

Most hosts sit behind **NAT** (no public address) and firewalls that drop unsolicited inbound traffic. Outbound connections work almost everywhere. That asymmetry is why client–cloud is easy and P2P is hard, and why orchestrators like ColonyOS let executors **pull** work from a reachable broker instead of being called.

NAT types: **full cone** (any external host can reach the mapped port), **(address-)restricted cone**, **port-restricted cone**, and **symmetric** (a new external port per destination, so the mapping learned from one server is useless for another peer).

- **Rendezvous / signalling server:** a public server both peers can reach, used to exchange their addresses.
- **STUN (Session Traversal Utilities for NAT):** the client **behind** the NAT sends a request to a STUN server on the public internet, which replies "I saw you as IP:port". The client learns its public mapping and shares it through the rendezvous server; both peers then send packets to each other simultaneously (**UDP hole punching**) and talk **directly**. Initiated by the internal node, not by external nodes. Cheap (no relaying) but fails with **symmetric NAT**.
- **TURN (Traversal Using Relays around NAT):** a public **relay** server. Each peer connects outward to the TURN server and **all payload data is relayed through it** (an external anchor point). Works through any NAT, including two peers behind symmetric NATs, so communication can be sustained. Costs: relay bandwidth and latency, a third party in the path; it is **not** direct P2P and not efficient for payload. Nothing to do with turning DoS attacks around.
- **ICE:** try direct, then STUN-derived candidates, then fall back to TURN (WebRTC does this).

### DNS for service location and fail-over

See [01](01-fundamentals.md): round-robin DNS returns several IPs; DNS hosting can health-check servers and advertise only live ones.

## Likely essay angles

- Key properties of pub-sub and message queues and of their messages (2023 Q2a): table above.
- Why P2P needs NAT traversal and how STUN and TURN differ (trade-off: direct and cheap vs always works and expensive).
- Direct vs indirect communication; synchronous vs asynchronous primitives.

## Old exam questions

### Essay questions

- **2023 Q2a**: key properties of pub-sub and message queues; properties of the messages.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1c | Marshaling is not needed in client–cloud, making it more popular than P2P | **False** |
| 2018 Q1d | STUN is initiated by external nodes to find addresses of nodes behind the firewall | **False**. The internal node asks a public STUN server for its own mapping. |
| 2018 Q1e | TURN lets firewalls turn DoS attacks back on senders | **False**. TURN is a relay. |
| 2018 Q1k | Pub-sub is based on channels/streams of immutable messages | **True** |
| 2018 Q1l | Kafka uses global consensus for responsibilities over servers | **True** (ZooKeeper, now KRaft) |
| 2019 Q1c | Marshaling is essential for inter-platform RPC | **True** |
| 2019 Q1m | TURN may enable communication through a symmetric firewall | **True** |
| 2019 Q1o | Pub-sub is based on mutable messages | **False** |
| 2019 Q1p | A pub-sub service is itself a scalable DS that shards topics | **True** |
| 2019 Q1q | Kafka needs no internal global state synchronization | **False** |
| 2020 Q1f | Marshaling gives a unique, irreversible mapping to a unique key | **False**. That describes hashing; marshaling is reversible. |
| 2020 Q1p | TURN is efficient in handling payload data | **False**. Everything is relayed. |
| 2020 Q1r / 2021 Q1s | Pub-sub shards and replicates topics to subsets of servers | **True** |
| 2020 Q1s | Kafka relies on global consensus for responsibilities and leadership | **True** |
| 2021 Q1i | Marshaling is an irreversible mapping to a standard format | **False** |
| 2021 Q1r / 2022 Q1p | TURN relays all payload through an external anchor point | **True** |
| 2021 Q1u | Pub-sub messages are consumed when read (read once) | **False**. That is queue semantics; pub-sub delivers to every subscriber (Kafka even retains them). |
| 2022 Q1h | Marshaling is only in older packages, not modern approaches | **False**. Protobuf, gRPC, Cap'n Proto. |
| 2022 Q1q | Most pub-sub services are decentralized | **False**. Distributed, but centrally operated brokers. |
| 2022 Q1t | In a message queue with multiple receivers each message goes to one of them | **True** |
| 2023 Q1a | Marshaling converts data to a platform-dependent format | **False**. Platform-independent. |
| 2023 Q1g | TURN enables direct P2P without a relay | **False** |
| 2023 Q1i | Mutable messages are a key paradigm | **False** |
| 2023 Q1k | Rendezvous handshaking is typical in geo-distributed systems | **Depends/False**. Synchronous rendezvous primitives suit tightly coupled systems; geo systems are asynchronous. (A rendezvous *server* for NAT traversal is common, worth mentioning.) |
| 2023 Q1m | Kafka is completely distributed, no internal global sync | **False** |
| 2023 Q1n | SRM can in the worst case suffer ACK explosions | **Depends/False**. SRM uses NACKs with random suppression timers precisely to avoid ACK implosion; badly tuned it can still see NACK/repair bursts. |
| 2024 Q1a | Marshaling is used to get global consensus on ordering | **False** |
| 2024 Q1g | TURN can sustain P2P communication between peers behind symmetric firewalls | **True** (via the relay) |
| 2024 Q1i | Immutable messages are a key paradigm; messages can be reliable or unreliable | **True** |
| 2024 Q1k | Rendezvous handshaking is typical in asynchronous systems | **False**. It is a synchronous primitive. |
| 2024 Q1m | Message queues and pub-sub have the same semantics, both subscription-based | **False** |
| 2024 Q1n | SRM is based on negative acknowledgements | **True** |

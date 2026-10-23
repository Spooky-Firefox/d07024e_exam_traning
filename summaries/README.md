# D7024E topic summaries

One file per recurring exam topic. Each file has three parts:

1. **Core ideas**: what the lectures say, condensed, with the trade-offs the teachers keep coming back to.
2. **Likely essay angles**: how the topic has been asked as a 2–9 point essay question, with an answer outline.
3. **Old exam questions**: every old question the topic answers, with a suggested answer for the true/false/"depends" statements.

The suggested true/false answers are my own reading of the slides. There is no official answer key in the repo, so treat them as a starting point and check anything that looks off against the lecture PDF linked at the top of each file. Where a statement is genuinely ambiguous the suggested answer is "depends", with the explanation you would have to write to get the point.

## Files

| # | Topic | Main lectures |
|---|---|---|
| 01 | [Distributed systems fundamentals](01-fundamentals.md) (system models, scalability, high availability, DNS, databases/ACID, security/PGP) | 2025 L1, 2026 L1, 2026 L3 |
| 02 | [Consensus](02-consensus.md) (Paxos, ZooKeeper/Zab, Raft, Byzantine generals, BFT limits, PBFT) | 2025 L7, 2025 L8 |
| 03 | [Blockchain](03-blockchain.md) (Bitcoin, PoW/PoS, Ethereum, smart contracts, scaling, sharding) | 2025 L8 |
| 04 | [Kademlia and DHTs](04-kademlia-dhts.md) (consistent hashing, Chord, CAN, Kademlia, testing at scale) | 2025 L2, L4-1 |
| 05 | [Consistency and replication](05-consistency-replication.md) (CAP, consistency models, clocks, 2PC, CRDTs vs OT) | 2026 L3, 2025 L5/L6, 2026 L7 |
| 06 | [Messaging and NAT traversal](06-messaging-nat.md) (RPC, marshalling, pub-sub, queues, Kafka, gossip, SRM, STUN/TURN) | 2026 L3, 2025 L1 |
| 07 | [Microservices](07-microservices.md) (SOA, service discovery, event bus, database per service, service mesh, serverless) | 2025 L11 |
| 08 | [Game backends](08-game-backends.md) (genres, sync models, lag compensation, dead reckoning, MMO scaling) | 2025 L9 |
| 09 | [Virtualisation and orchestration](09-virtualisation-orchestration.md) (VMs, containers, Kubernetes, scheduling, MapReduce, ColonyOS) | 2025 L10/L11, 2026 L8 |
| 10 | [Go concurrency](10-go-concurrency.md) (goroutines, channels, actors, mutexes, context, deadlocks, processes vs threads) | 2025 L2, 2026 L2 |

## Exam format (what you are training for)

- Take-home, about 4 hours. Web and GenAI allowed, but you must cite sources and, if you use GenAI, add a short personal reflection.
- Question 1 is always a block of 12–24 statements answered **true / false / depends**, 0.5 p each. "Depends" only scores with a short explanation. A good corner-case explanation can earn the point even against the expected answer.
- The rest are essay questions worth 2–9 p. From 2025 on they are design-heavy ("design a backend for genre X", "design a Kubernetes-style autoscaler", "argue whether containers replace VMs") and ask you to argue trade-offs.
- 2026 grading: the home exam is 100 % of the course score (lab and seminar are pass/fail). Grade 3/4/5 at 50/70/85.

## Old exams in the repo

| Exam | File |
|---|---|
| 2018-10-26 | [OLD_2018-10-26_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2018-10-26_D7024E_Exam.pdf) |
| 2019-10-30 | [OLD_2019-10-30_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2019-10-30_D7024E_Exam.pdf) |
| 2020-10-26 | [OLD_2020-10-26_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2020-10-26_D7024E_Exam.pdf) |
| 2021-10-26 | [OLD_2021-10-26_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2021-10-26_D7024E_Exam.pdf) |
| 2022-10-24 | [OLD_2022-10-24_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2022-10-24_D7024E_Exam.pdf) |
| 2023-10-21 | [OLD_2023-10-21_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2023-10-21_D7024E_Exam.pdf) |
| 2024-10-30 | [OLD_2024-10-30_D7024E_Exam.pdf](../D7024E%20Exam/OLD_2024-10-30_D7024E_Exam.pdf) |
| 2025-10-28 | [2025-10-28_D7024E_Exam.pdf](../D7024E%20Exam/2025-10-28_D7024E_Exam.pdf) |
| 2025-11-19 (re-exam, one essay) | [2025-11-19-Extra-Exam.pdf](../D7024E%20Exam/2025-11-19-Extra-Exam.pdf) |

Question references in the summaries use the form **2022 Q1k** (exam year, question 1, statement k) or **2021 Q2d** (exam year, question 2, sub-question d).

## Which essay question lives where

| Exam | Essay questions → summary file |
|---|---|
| 2018 | Q2a–c → [01](01-fundamentals.md) · Q3a–b → [03](03-blockchain.md) |
| 2019 | Q2a–c → [07](07-microservices.md) · Q3a–b → [03](03-blockchain.md) |
| 2020 | Q2a → [04](04-kademlia-dhts.md) · Q2b → [09](09-virtualisation-orchestration.md) · Q2c → [07](07-microservices.md) · Q2d → [01](01-fundamentals.md) · Q3a–c → [03](03-blockchain.md) |
| 2021 | Q2a, Q2d → [02](02-consensus.md) · Q2b → [07](07-microservices.md) · Q2c, Q2e → [03](03-blockchain.md) · Q2f → [05](05-consistency-replication.md) |
| 2022 | Q2a → [01](01-fundamentals.md) · Q2b → [02](02-consensus.md) · Q2c → [03](03-blockchain.md) · Q2d → [08](08-game-backends.md) · Q2e → [01](01-fundamentals.md) |
| 2023 | Q2a → [06](06-messaging-nat.md) · Q2b → [07](07-microservices.md) · Q2c → [08](08-game-backends.md) · Q2d → [03](03-blockchain.md) |
| 2024 | Q2a → [01](01-fundamentals.md) · Q2b, Q2e → [02](02-consensus.md) · Q2c → [08](08-game-backends.md) · Q2d → [03](03-blockchain.md) |
| 2025 | Q2a → [08](08-game-backends.md) · Q2b → [03](03-blockchain.md) · Q3c–d → [09](09-virtualisation-orchestration.md) · Q4e–f → [10](10-go-concurrency.md) · Q4g → [04](04-kademlia-dhts.md) |
| 2025 re-exam | Kademlia + GenAI correctness essay → [04](04-kademlia-dhts.md) |

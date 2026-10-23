# 07 · Microservices

Sources: [2025 L11 Modern compute platforms](../D7024E%20Lecture%20slides/D7024E_L11_ModernCompute.pdf), the architecture slides of [2026 L1](../D7024E_Lectures_2026/D7024E_L1_Course_Introduction_V2.pdf). Olov's microservices lecture (2019–2023 exams) is not in the repo; service discovery, event bus and saga material follows Martin Fowler's article and microservices.io (both linked from L11).

## Core ideas

### From monolith to SOA to microservices

- **Monolith:** one deployable unit; one database; scale by copying the whole thing.
- **SOA (2000s–2012):** services with well-defined interfaces talking over an **Enterprise Service Bus**; loose coupling, interoperability, reuse, discoverability. In practice: heavyweight XML/SOAP, stateful EJBs tied to app servers, the ESB became a bottleneck and single point of failure, and projects turned into large centralized integration efforts.
- **Microservices (2014–):** "a single application as a suite of small services, each running in its own process and communicating with lightweight mechanisms, independently deployable by fully automated deployment machinery" (Fowler). Distinguishing features:
  - **Small, independently deployable** services split along business capabilities.
  - **Each service owns its data store** (database per service, polyglot persistence); no shared database.
  - **Lightweight communication:** REST/gRPC for request/response, an **event bus / message broker** for asynchronous events. "Smart endpoints, dumb pipes" (unlike SOA's smart ESB).
  - **Teams own their services end to end** (build, run, on-call): decentralized governance, each team picks its own languages and tools. Matches Conway's law; many teams can work and release in parallel.
  - **Designed for failure:** expect partial failures, use timeouts, retries, circuit breakers.
  - **Automation:** CI/CD, containers, orchestration (Kubernetes), monitoring.
  - Consistency between services is **eventual**, not transactional.

### Service discovery (2019 Q2a)

**Purpose:** service instances come and go (autoscaling, crashes, deploys) and get dynamic addresses, so a caller cannot hard-code where a service lives. Discovery maps a logical service name to the current set of healthy instances.

- **Service registry:** a database of instances (Consul, etcd, ZooKeeper, Eureka). Usually itself a replicated, consensus-backed store.
- **Registration:** self-registration (the instance registers on start-up and sends heartbeats; a TTL removes dead ones) or third-party registration (the platform registers it, e.g. Kubernetes).
- **Client-side discovery:** the client queries the registry and load-balances itself (Netflix Eureka + Ribbon).
- **Server-side discovery:** the client calls a load balancer/router, which queries the registry (AWS ELB, Kubernetes Service).
- **Kubernetes:** a Service gets a stable virtual ClusterIP and a DNS name (CoreDNS); kube-proxy/eBPF spreads connections over the healthy pod endpoints selected by labels. So DNS *is* used for discovery in Kubernetes and Consul, but classic registries (Eureka, ZooKeeper) are not DNS-based. Plain DNS caching/TTL makes it too slow for fast-changing instance lists on its own.
- **Health checks** keep the registry honest.

### Event handler / event bus (2019 Q2b, 2023 Q2b)

**Purpose:** let services communicate **asynchronously** through events ("OrderPlaced", "PaymentFailed") instead of calling each other directly.

- Decoupling in **space** (publisher does not know who listens) and **time** (consumers can be down and catch up later).
- New consumers can be added just by subscribing (extensibility).
- Absorbs load bursts; avoids cascading synchronous failures.
- Basis for keeping data in sync across services: a service publishes an event when its data changes; other services update their own copies/read models (**eventual consistency**).
- Enables **event sourcing** (store the log of events as the source of truth) and **CQRS** (separate write model and read-optimized query models).
- Implemented with Kafka, RabbitMQ, NATS, cloud pub-sub. Use the **transactional outbox** pattern so "update my DB" and "publish event" cannot diverge.
- Costs: harder debugging and tracing, ordering and duplicate delivery must be handled (idempotent consumers), eventual consistency visible to users.

### Data: database per service and consistency (2019 Q2c, 2020 Q2c)

**How the separation is done:** each service has its own private schema or its own database server, chosen to fit its needs (relational for orders, document store for catalogue, search engine for queries). Other services access the data only through the owning service's API or through events, never by querying its tables.

**Advantages:** loose coupling (schema changes stay inside one service), independent deployment and scaling, right tool per job, fault isolation, team autonomy.

**Disadvantages and why consistency is a challenge:**

- A business operation spans several services and therefore several databases, so there is **no single ACID transaction**.
- Distributed transactions (2PC) are avoided: they block, couple services, need every participant up, and many NoSQL stores and brokers do not support them.
- Instead use **sagas**: a sequence of local transactions, each publishing an event that triggers the next; on failure, run **compensating transactions** (refund, cancel reservation). Choreography (services react to each other's events) or orchestration (a central saga coordinator).
- Result: **eventual consistency**; intermediate states are visible; you must design for duplicates and out-of-order events.
- Queries that join data across services need API composition or replicated read models (CQRS).
- Data duplication across services.

### Operating microservices (2025 L11)

- **Containers + Kubernetes** handle deployment, scaling, self-healing, load balancing, service discovery and declarative configuration (see [09](09-virtualisation-orchestration.md)).
- **Service mesh** (Istio, Linkerd, Consul Connect): a sidecar proxy next to every service plus a control plane. Moves cross-cutting communication concerns out of application code: mTLS between services (zero trust), traffic shaping (canary, blue/green), retries, timeouts, **circuit breaking**, observability (metrics, traces), policies on who may talk to whom.
- **Circuit breaker:** after repeated failures to a dependency, fail fast with an immediate error instead of waiting for timeouts, then probe periodically. Prevents cascading failures and thread exhaustion. A shared breaker in the mesh gives consistent behaviour across hundreds of callers.
- **Separation of concerns:** microservices split business logic; Kubernetes handles infrastructure; the mesh handles communication; developers write code and declare intent.

### Serverless / FaaS

Deploy functions, not servers. Pay per execution, scale from zero to thousands instantly, event-driven by default. Functions must be stateless and idempotent; state lives in managed storage. Cons: cold starts, vendor lock-in, limited execution time, hard local testing. Examples: AWS Lambda, Azure Functions, Google Cloud Run, Knative, OpenFaaS.

### Trade-offs summary (benefits vs challenges, 2023 Q2b)

**Benefits:** independent deployment and faster delivery, independent scaling of hot services, fault isolation, technology freedom, many teams in parallel, smaller codebases.

**Challenges:** it is a distributed system (latency, partial failure, network unreliability), data consistency without transactions, operational complexity (hundreds of services, Kubernetes "YAML hell", monitoring, tracing), debugging across services, versioning of APIs and events, security surface (service-to-service auth), testing end-to-end, and risk of over-engineering.

## Likely essay angles

- Service discovery: purpose and typical implementation (2019 Q2a).
- Event handler/bus: purpose (2019 Q2b); event-driven paradigm with benefits and challenges (2023 Q2b).
- Database synchronization and why consistency is a challenge (2019 Q2c); how separation is made and trade-offs (2020 Q2c).
- Distinguishing features: services–database mapping, event handling, multi-team workforce, consistency of data (2021 Q2b). One paragraph each: database per service; async events over a broker; independent teams owning services end to end; eventual consistency via sagas and events.

## Old exam questions

### Essay questions

- **2019 Q2a–c**, **2020 Q2c**, **2021 Q2b**, **2023 Q2b**: see angles above.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2022 Q1l | DNS is normally used by SOA and microservices service registries | **Depends**. Kubernetes (CoreDNS) and Consul expose discovery via DNS, but classic registries (Eureka, ZooKeeper, SOA UDDI) are separate services queried by API; plain DNS TTLs are too slow for rapidly changing instances. |

# 09 · Virtualisation and orchestration

Sources: [2025 L10 Virtualisation](../D7024E%20Lecture%20slides/D7024E_L10_Virtualisation.pdf), [2025 L11 Modern compute platforms](../D7024E%20Lecture%20slides/D7024E_L11_ModernCompute.pdf), [2026 L8 Orchestration and scheduling](../D7024E_Lectures_2026/D7024E_L8_Orchestration.pdf). All three by the examiner (Johan Kristiansson), so expect design questions in this area.

## Core ideas: virtualisation

### Why virtualise

Before virtualisation each service had its own physical server: 10–20 % CPU utilization, peak provisioning, weeks to get a server, one crash could take neighbours down, upgrading meant buying a new box. A **virtual machine** emulates a computer in software: virtual CPU, memory, disk and NICs, plus its own guest OS. Gains: consolidation (10–20 servers onto one), provisioning in minutes, live migration, snapshots and cloning, disaster recovery, templates.

### Hypervisors

- **Type 1 (bare metal):** runs directly on hardware. Better performance, smaller attack surface. ESXi, Xen, Hyper-V, KVM. Data centres and clouds.
- **Type 2 (hosted):** runs as an application on a host OS. Easy to install, more overhead. VirtualBox, VMware Workstation, Parallels.
- **CPU virtualisation:** most guest instructions run directly on the CPU; privileged instructions **trap** to the hypervisor, which emulates them. Hardware extensions (Intel VT-x, AMD-V) make this efficient. VMs run at a lower privilege level than the hypervisor.
- **Memory virtualisation:** each VM sees memory starting at 0; the hypervisor maps guest-physical to host-physical addresses (shadow page tables or hardware **EPT/NPT**). The MMU enforces isolation.
- **Full virtualisation:** unmodified guest OS; hypervisor traps/emulates. Any OS runs; more overhead.
- **Para-virtualisation:** guest kernel is modified to make **hypercalls** instead of privileged instructions (Xen PV, I/O through Dom0 front/back-end drivers). Faster, but needs a modified kernel.
- **Hardware-assisted virtualisation:** CPU extensions trap privileged instructions, so unmodified guests run near-native; often combined with para-virtualised I/O drivers (virtio).
- **Network virtualisation / SDN:** virtual switches, routers and firewalls; control plane separated from data plane; programmable by API.

### Infrastructure as code and the problems VMs left

- **OpenStack:** open-source IaaS (Nova compute, Glance images, Neutron networking, Cinder volumes, Keystone auth). Design: stateless control-plane services behind load balancers, shared state in an external database, coordination through an HA message queue (RabbitMQ; quorum queues are CP). No Paxos/Raft needed in the services themselves.
- **IaC:** Terraform (declarative, plan/apply), Ansible (playbooks over SSH), Pulumi (general-purpose languages). Infrastructure becomes version-controlled and repeatable.
- **Remaining problems with VMs:** each VM carries a full OS (GBs, minutes to boot, 5–10 % hypervisor overhead), sizing fixed at deploy time, low real utilization (cores 80 % allocated while memory sits at 50–70 %), **dependency hell** (upgrading a library for one service breaks another on the same VM), **"works on my machine"** (dev and prod differ), VM sprawl, configuration drift. Vagrant was an early fix (identical dev VMs from code).

### Containers

- The shipping-container analogy: standardize the box, not the goods.
- A container packages an app with its libraries, runtime and config, but **shares the host kernel**. Starts in milliseconds to seconds, weighs MBs, 100s–1000s per host.
- **Images** are layered, immutable, stored in registries (Docker Hub, Harbor), built from a Dockerfile. Same image in dev, test and prod.
- **Container = namespaces + cgroups + root filesystem + runtime.**
  - **Namespaces** ("what can you see"): PID, mount, network, UTS (hostname), IPC, user.
  - **cgroups** ("how much can you use"): CPU, memory, I/O, number of PIDs.
  - **rootfs:** the image's filesystem (overlay filesystems).
  - **Runtime:** Docker, Podman (daemonless, rootless), containerd (lifecycle only, used by Kubernetes), Apptainer/Singularity (HPC).
- New paradigms: immutable infrastructure (replace, never patch), declarative configuration, GitOps, cloud-native microservices.

| | VMs (hypervisor) | Containers (namespaces + cgroups) |
|---|---|---|
| Kernel | separate per VM | shared |
| Isolation | hardware boundary, complete | software, process-level |
| Boot | seconds–minutes | milliseconds |
| Overhead | high (full OS) | low |
| OS choice | any OS | same kernel as host |
| Security | strong, mature | kernel shared: a kernel exploit or container escape hits everyone |

### Beyond containers

- **MicroVMs (Firecracker):** KVM-based VMM stripped of BIOS, PCI, USB, GPU etc. Own kernel per guest (VM-grade isolation) with ~100–200 ms boot and ~5 MB overhead. Built for AWS Lambda and Fargate, where containers isolate too weakly for multi-tenant clouds and VMs start too slowly. **Kata Containers** run each container in a microVM behind the normal container API (OCI compliant).
- **Unikernels (Unikraft, MirageOS, IncludeOS):** the app compiled together with only the OS pieces it needs into one single-address-space image running on a hypervisor. Tiny, ms boot, small attack surface; niche tooling, hard to debug, one app per image.
- **WebAssembly (Wasmtime, WasmEdge):** portable bytecode in a memory-safe sandbox with no direct syscalls (capability-based). ms startup, tiny footprint, language-agnostic; ideal for edge, serverless, plugins; ecosystem still emerging and 10–30 % slower than native.
- Trade-off axes in the lecture: startup time (Wasm best, VMs worst), isolation (VMs best, containers weakest), flexibility (VMs most), footprint, performance.

### Will containers replace VMs in the next decade? (2025 Q3c)

Argue **no, they converge rather than replace**:

- Containers share the host kernel, so their isolation is a software boundary. Multi-tenant clouds that run untrusted code need a hardware boundary, which is why AWS built Firecracker and why Kata exists. Containers in practice already run **inside VMs** (every managed Kubernetes node is a VM).
- Workloads needing a different kernel, a different OS (Windows apps on Linux hosts), kernel modules, or legacy monoliths still need VMs.
- Hardware virtualisation (VT-x, EPT) keeps getting cheaper, and microVMs bring VM isolation close to container speed, blurring the line.
- Unikernels and Wasm attack from the other side (even lighter than containers, stronger sandboxing).
- Where containers *do* win and keep winning: packaging and deployment of cloud-native apps, density, startup speed, developer workflow.
- Conclusion: the container **interface** (OCI images, Kubernetes) becomes the standard way to package and run software, while the isolation underneath is chosen per workload: namespaces for trusted code, microVMs/VMs for untrusted or multi-tenant code.

## Core ideas: orchestration

### Kubernetes

- Open-source container orchestration (from Google's Borg, now CNCF): self-healing, scaling, load balancing, service discovery, declarative configuration, immutable infrastructure.
- **Pod:** smallest deployable unit, one or more tightly coupled containers sharing an IP and volumes.
- **Control plane:** **kube-apiserver** (the only door to the state; every read/write and watch goes through it; stateless, can be replicated), **etcd** (Raft-replicated key-value store, single source of truth for desired and actual state, see [02](02-consensus.md)), **kube-scheduler** (assigns pods to nodes), **controller-manager** (runs the controllers). Schedulers and controllers run several replicas with **leader election** (a lease object in etcd), so only one is active.
- **Worker nodes:** **kubelet** (watches pods bound to its node, starts containers via containerd, sets cgroups from requests/limits, reports status), **kube-proxy** (implements Services with iptables/IPVS/eBPF), a **CNI** plugin for pod networking (Flannel: simple VXLAN overlay; Calico: L3 routing and network policies; Cilium: eBPF).
- **Service:** stable virtual ClusterIP + DNS name load-balancing over pods selected by **labels**. **Ingress controller** (Traefik, NGINX) terminates TLS and routes HTTP by host/path; **cert-manager** gets certificates from Let's Encrypt via ACME (HTTP-01 or DNS-01 challenge).
- **Deployment** (stateless, interchangeable pods, rolling updates) vs **StatefulSet** (stable identities, persistent volumes via PVC templates, ordered start-up: databases, queues).
- **Operators:** custom controllers + CustomResourceDefinitions that manage a specific application (database, IoT device) with the same reconcile pattern. **KubeEdge** extends the control plane to edge nodes that keep working while disconnected.
- Kubernetes' own trade-off: complexity (learning curve, YAML hell, too many choices, debugging), upgrades, multi-cluster pain, security (shared kernel, image supply chain, RBAC, secrets), and over-engineering for simple apps.

### The reconciliation loop (declarative control)

You declare **desired state** ("3 replicas of this image"); controllers continuously drive **actual state** towards it:

1. **Observe** actual state (through the API server's watch).
2. **Compare** with the desired spec.
3. **Act** to reduce the difference (create a pod, delete one, reschedule).
4. **Repeat forever.**

Key properties: **level-triggered** (react to the current difference, not to individual events, so a missed event is corrected on the next pass), **idempotent** actions (safe to repeat after a crash), the controller itself is stateless (state is in etcd), so a crashed controller is simply restarted or replaced by a standby that wins the leader lease.

Example: the **HorizontalPodAutoscaler** every 15 s reads CPU/memory from the metrics server, computes desiredReplicas = ceil(current × currentMetric / targetMetric), and writes the new replica count to the Deployment; the ReplicaSet controller sees desired ≠ actual and creates pods; the scheduler binds them; kubelets start them. Stabilization windows and scale-up/down policies prevent flapping.

### Design a Kubernetes-style autoscaling orchestrator (2025 Q3d, 9 p)

**Assumptions:** crash-recovery nodes, partially synchronous network (partitions possible but heal), no Byzantine nodes, a small control-plane cluster (3 or 5 nodes) and many workers; workloads are containers that can be restarted elsewhere; clocks are not trusted for correctness, only for timeouts.

**a) Reconciliation loop tolerating crashes**

- Desired state (deployments, replica counts, autoscaling targets) and observed state are stored in a **Raft-replicated store** (etcd). It survives f crashes with 2f + 1 members; every controller decision is a write that is either committed by a majority or not at all.
- Controllers are stateless loops: observe → diff → act → repeat. Actions are **idempotent** and written with **compare-and-swap on resource versions**, so two controllers (or a controller and its restarted self) cannot double-apply.
- Only one instance of each controller acts at a time, chosen by a **lease** in the store; a crashed leader's lease expires and a standby takes over. Because loops are level-triggered, the new leader just recomputes the diff.
- Worker failure: kubelets renew a **node lease** (heartbeat). If a lease expires, the node controller marks the node NotReady, waits a grace period (it might only be slow or partitioned), then evicts and re-creates its pods elsewhere. Pods with stable identity (StatefulSet) are not re-created until the old one is known dead (fencing), to avoid two copies.

**b) Architecture and coordination during scaling**

- **API server:** stateless front end, the only component that talks to the store; authenticates, validates, supports watch streams. Replicated behind a load balancer.
- **State store:** etcd (Raft), source of truth.
- **Metrics pipeline:** kubelets/cAdvisor → metrics server (or Prometheus) → metrics API.
- **Autoscalers:** HPA (pods per deployment from metrics), cluster autoscaler (adds/removes worker VMs when pods cannot be scheduled or nodes are idle).
- **Scheduler:** watches unscheduled pods; **filter** nodes that fit (resource requests, taints, affinity), **score** the rest (least allocated, image locality, topology spread), **bind** by writing nodeName. Placement is bin packing (NP-hard, so heuristics).
- **Controllers:** ReplicaSet/Deployment controller turns replica counts into pod objects.
- **Kubelets:** start/stop containers and report status.
- All of them communicate only by reading/writing/watching objects through the API server: no direct calls, so any component can crash and resume from the stored state.
- **Failures in a distributed environment:** API server replica dies (others serve), etcd minority dies (still available), etcd majority lost (control plane read-only/unavailable, but running pods keep running: CP choice), network partition of a worker (lease expires, pods rescheduled, the old ones fenced when the node returns), metrics missing (HPA does not scale on missing data rather than guessing).

**c) Data flow and a scaling event step by step** (draw boxes: users → Service/Ingress → pods; kubelets → metrics → HPA → API server ↔ etcd; scheduler, controllers and kubelets watching the API server):

1. Load increases; pod CPU rises above the target (e.g. 40 %).
2. Metrics server aggregates the new utilisation; HPA's loop (every 15 s) reads it.
3. HPA computes the desired replica count (e.g. 2 → 4), applies its scale-up policy and stabilization window, and writes `replicas: 4` to the Deployment via the API server; etcd commits it through Raft.
4. The ReplicaSet controller observes desired 4 vs actual 2 and creates two pod objects with no node.
5. The scheduler sees the pending pods, filters and scores nodes, and binds each pod to a node.
6. If no node fits, the pods stay Pending and the cluster autoscaler adds a worker VM, after which scheduling succeeds.
7. Each target kubelet sees a pod bound to it, pulls the image, starts the container with cgroup limits, and reports Running and Ready.
8. The Service endpoints update; kube-proxy starts sending traffic to the new pods; CPU per pod drops back towards the target.
9. **Scale down** reverses it after the stabilization window: HPA lowers replicas, the controller picks pods to delete, pods get a graceful termination signal, endpoints are removed first so no requests are dropped.
10. **Failure during scaling:** if the scheduler crashes after binding one pod, the standby takes the lease and binds the rest (the bound one is already in etcd, so it is not duplicated); if a node dies while starting a pod, its lease expires and the pod is re-created elsewhere.

### Workflows, scheduling and queues (2026 L8)

- **Workflow** = what (a DAG of tasks and data dependencies). **Scheduling** = where and when (a decision). **Orchestration** = the loop that tracks readiness, schedules, dispatches, executes, records outcomes and recovers from failure.
- **Readiness:** a task is READY when all parents are recorded SUCCESS (the coordinator's durable record, not a machine's belief). States: WAITING → READY → RUNNING → SUCCESS / FAILED (retry while budget remains).
- **Work and span:** total work T₁ and longest path T∞. Makespan ≥ max(T₁/m, T∞). More machines cannot beat the span.
- **Graham's anomaly:** with a fixed priority list, adding a fourth machine made the schedule *longer* (15 vs 12) because a short task grabbed the free machine before the critical-path task became ready. Cure: **critical path first** (prioritize by rank = own time + longest path through successors).
- **Bin packing:** placing resource demands (CPU, memory, GPU) into machines without overflow is NP-hard. Brute force is kⁿ. Heuristics: first-fit, best-fit, **first-fit decreasing** (buffer, sort large to small, then first-fit: found the optimum 4 servers where first-fit used 6 and best-fit 5). Meta-heuristics: **genetic algorithms** (chromosome = placement string, fitness = over-allocation, selection, crossover, mutation). **Pack vs spread:** packing saves machines but concentrates failures; spreading survives machine loss but wastes capacity.
- **Little's law:** L = λ · W (items in system = arrival rate × time in system), for any stable system. **Utilization curve (M/M/2):** waiting time grows like 1/(1 − ρ²) and explodes as utilization ρ → 100 %. Running servers near full load means huge queues.
- **Backfilling:** let small jobs jump ahead if they finish before the head-of-queue job's reservation. Also priority decay (fair share) and **carbon-aware scheduling** (run deferrable jobs when the grid's carbon intensity is low).

### MapReduce

- Programming model: user writes **map(k₁, v₁) → list(k₂, v₂)** and **reduce(k₂, list(v₂)) → list(v₃)**; the framework splits input, runs maps in parallel, **shuffles** (groups all values per key across machines), runs reduces in parallel, and handles placement, retries and stragglers.
- **Move computation to the data:** the master knows where each input block lives in the distributed file system (HDFS) and runs map tasks on (or near) the node storing the block. Only task descriptions (kB) travel; the big input stays put.
- **How data communication is minimized (2020 Q2b):** data locality for maps (computation sent to data, read from local disk); a **combiner** pre-aggregates map output locally before the shuffle (e.g. word counts summed per mapper); map output is partitioned by reducer and written to local disk, so the **shuffle** is the only place data crosses the network by design; compression of intermediate data; rack-aware placement.
- A **combiner can only be used when the reduce function is commutative and associative** (sum, max, count). It cannot for, e.g., average (unless you carry sum and count) or median. So "a combiner can always be used" is false.
- **Fault tolerance:** heartbeats; silence means failure; tasks on a dead worker (including finished maps, whose output was on its disk) are re-run; stragglers get **backup tasks** (speculative execution); output committed by atomic rename; safe because tasks are deterministic.
- Hadoop is designed for **clusters in one datacenter**, not geo-distribution (the shuffle across WAN would be prohibitively slow).
- **Spark vs Hadoop MapReduce:** Spark keeps intermediate data **in memory** (RDDs/DataFrames) and builds a DAG of stages, so iterative algorithms (ML) and interactive queries are 10–100× faster; it also offers streaming (micro-batch / structured streaming). Hadoop writes to disk between every stage and is batch-only. Not "similar properties in most cases".
- **Batch vs stream:** batch processes data at rest (bounded, hours, exact); stream processes data in motion (unbounded, seconds, often approximate). Hot path vs cold path (2026 L1).

### Orchestrating across networks you do not own: ColonyOS (2026 L8)

- Direct remote start (SSH, MPI) needs a reachable address and an open inbound route. Edge sites behind NAT and HPC clusters of other organisations cannot be called into, but can call out.
- So use a **broker** with a stable address (star topology; a durable single point to replicate) and let executors **pull** work: "I am E1, edge, with free capacity, give me work I can run".
- Submit **intent**, not processes: a FunctionSpec with function, inputs (by reference with hash), needs (CPU, GPU), where/when constraints, max wait/exec time, retries.
- Assignment: **pull** (works behind NAT, gives natural back-pressure) → **match** (parents done and conditions ⊆ capabilities) → atomic **claim** (WAITING → RUNNING in one conditional database update, with a deadline = **lease**) → idempotent **close** (SUCCESS/FAILED; repeated or late closes refused).
- The twelve failure modes and their cures: process crash (record attempt, retry with budget); machine crash (detect by time: lease); lost request (pull, just ask again); lost reply (idempotent close); partition (lease expires on both sides, late close refused); overload (back-pressure via pull, tune timeouts); no progress (max exec time); bad data (inputs by hash, validate); duplicate execution (atomic claim, idempotent functions, reconcile before retry); stragglers (speculative backup, first close wins); infeasible placement (match before assign); lost history (durable record outside any worker).
- A second queue (Slurm under an HPC executor) means a second clock: the lease must cover native queue wait too, and before resubmitting you must reconcile whether the old job still runs.

## Likely essay angles

- MapReduce communication minimization (2020 Q2b).
- Containers vs VMs (2025 Q3c).
- Designing an autoscaling orchestrator (2025 Q3d).

## Old exam questions

### Essay questions

- **2020 Q2b**: ways MapReduce minimizes data communication.
- **2025 Q3c**: can/should containers replace VMs entirely in the next decade?
- **2025 Q3d**: design a robust, scalable Kubernetes-style autoscaling orchestrator (reconciliation loop, architecture, data/decision flow).

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1s / 2019 Q1t / 2024 Q1s | MapReduce moves computation to where data is stored | **True** |
| 2018 Q1t | MapReduce solutions like Hadoop are typically geo-distributed | **False**. Cluster-based. |
| 2023 Q1s | MapReduce in Hadoop is designed for highly geo-distributed analysis | **False** |
| 2021 Q1v / 2022 Q1v | A Hadoop combiner can always be used to reduce data sent to reducers | **False**. Only for commutative and associative reduce functions. |
| 2022 Q1u | Big data processing is efficient by sending computation to where sharded data is stored | **True** |
| 2024 Q1t | Spark and Hadoop MapReduce provide similar properties in most cases | **False**. In-memory, iterative and streaming vs disk-based batch. |

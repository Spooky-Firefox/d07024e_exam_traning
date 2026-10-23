# Episode five. Orchestration, scheduling and Kubernetes.

Welcome to the final episode. The twenty twenty five exam gave nine points to designing a container orchestration framework with autoscaling, and the 2026 course has a full lecture on orchestration and scheduling. In this episode we cover workflows, scheduling and orchestration, the Kubernetes architecture and its reconciliation loops, bin packing, queueing with Little's law, the twelve failure modes from the ColonyOS case study, and finally a template answer for the exam design question.

## Three words: workflow, scheduling, orchestration

The lecture separates three ideas. A workflow is the specification: a set of tasks and the dependencies between them, written as a directed acyclic graph, or DAG, plus what each task consumes and produces. It says what must run and in which order, not where or when. Scheduling is the decision: which ready task goes to which machine, when, and ahead of whom, decided online by a policy. Orchestration is the control loop that makes it happen: track readiness, schedule, dispatch, execute, record outcomes, recover from failure, and expose what is happening. In short, the workflow is the input, the scheduler is one step in the loop, and the orchestrator is the loop.

## Workflows as DAGs

A task becomes ready when all its parents have succeeded, according to the coordinator's recorded state, not what some machine believes. Tasks move through a state machine: waiting, ready, running, then success or failed, with retries while attempts remain under a budget.

Two numbers describe a DAG. Work is the total time of all tasks. Span is the longest path, the critical path. With m machines, no schedule can finish faster than the larger of work divided by m, and span. Once span dominates, more machines cannot help.

Graham's anomaly is the surprise: with simple list scheduling, adding a machine can make the schedule longer. In the lecture's nine-task example, three machines finish in twelve time units, which is optimal, but four machines take fifteen, because a long task on the critical path gets started late. The cure is critical path first: rank every task by its own time plus the longest path through its successors, and always start the highest ranked ready task. With that rule, four machines finish in twelve again.

## Kubernetes architecture

Kubernetes automates deployment, scaling and management of containers. It descends from Google's Borg and is maintained by the Cloud Native Computing Foundation. Its smallest deployable unit is the pod, one or more tightly coupled containers sharing a network address and volumes.

The control plane has four main parts. The API server is the only door to the cluster state: every read and write goes through it, and clients can watch objects and get notified of each change. Etcd is the store, the single source of truth for both desired and actual state. It uses Raft, so all components see the same consistent view: each pod gets exactly one scheduling decision, with no duplicate assignments. The scheduler takes pods that have no node yet, filters out nodes that cannot run them, because of resources, taints or affinity, scores the rest, for example by least allocated or image locality, and binds the pod to the best node. The controller manager runs the controllers. On every worker node, the kubelet watches for pods bound to its node, starts containers through the container runtime, enforces resource limits with cgroups, and reports status back. Kube-proxy and the network plugin give every pod an IP address and implement services as load-balanced virtual IPs.

The path of a deployment: you apply a Deployment, the API server writes it to etcd. The deployment controller creates a ReplicaSet, and the ReplicaSet controller creates the pod objects, which are pending because they have no node. The scheduler binds each pod to a node. The kubelet on that node sees it and starts the containers. If a pod dies, a controller notices that the actual count is below the desired count and creates a new one.

## Declarative control and reconciliation loops

Kubernetes is declarative, not imperative. You do not say how; you say what you want, for example three replicas. Every controller runs a reconciliation loop with three steps, repeated forever. Observe: read the actual state through the API server. Compare: read the desired state from the object's specification. Act: if they differ, take a step to bring reality closer to the desire. If only two pods exist and three are wanted, start one.

Why is this robust? Because the loop is level triggered rather than edge triggered. It does not depend on seeing every event; it compares whole states, so a missed or duplicated notification just means the next iteration fixes it. The actions are idempotent: creating the third pod twice is prevented because the controller checks the current count first. And the state lives in etcd, not in the controller, so if a controller crashes, a new instance simply resumes the loop. Controllers often run with leader election, so only one active instance acts at a time.

Examples of controllers: the ReplicaSet controller keeps the right number of pods; the Deployment controller handles rolling updates and rollbacks; the Job controller runs pods to completion; the node controller marks nodes NotReady when they stop reporting heartbeats and evicts their pods; and the ingress controller routes incoming HTTP traffic to services.

Autoscaling is just another reconciliation loop. The horizontal pod autoscaler, which is standard Kubernetes but not detailed in the slides, observes a metric such as average CPU use, and computes desired replicas as the current replicas times the current metric divided by the target metric, rounded up. Then it writes that number into the deployment's specification, and the normal controllers do the rest. In practice you add a tolerance band and a stabilization window to avoid flapping, minimum and maximum replica counts, and a cluster autoscaler that adds nodes when pods cannot be scheduled.

## Placement is bin packing

Placing pods with resource demands, like CPU and memory, onto nodes with capacities is bin packing. Bin packing is NP-hard even in one dimension. A proposed placement is easy to check, one sum per node, but finding the best one by brute force means trying k to the power n assignments, which takes seventy seconds for sixteen allocations on four servers and billions of years for forty. So every scheduler uses a heuristic. First fit puts each request on the first server with room. Best fit picks the server with the least room left that still fits. First fit decreasing buffers requests, sorts them largest first, then applies first fit, and often reaches the optimum. Genetic algorithms are a meta-heuristic: encode a placement as a string, score it by how many cores are over capacity, keep the fittest, combine them with crossover, and occasionally mutate one gene.

There is also a policy choice: pack or spread. Packing uses the fewest machines but concentrates the impact of failures. Spreading survives machine loss but wastes capacity.

Other scheduling ideas from the lecture: backfilling lets a small job start now on idle nodes if it finishes before the reserved start time of the job at the head of the queue. Priority decay prevents starvation. Carbon-aware scheduling delays flexible jobs to hours when electricity has lower carbon intensity.

## Queues and Little's law

Little's law: the average number of requests in a system equals the arrival rate times the average time each spends in the system. L equals lambda times W. It holds for any stable system, with any arrival pattern and any service order.

The utilization curve is the key lesson. With two servers and four minute service time, the capacity is half a request per minute. As arrivals approach that capacity, waiting time does not grow linearly; it explodes. At eighty three percent utilization the mean wait is about nine minutes, at ninety percent about seventeen, at ninety four percent about thirty, and at one hundred percent there is no finite average. That is why autoscalers target something like sixty to eighty percent utilization, not one hundred.

## Data and communication

Control messages are small, but data must be fetched. Pass large data by reference, a name and a version, and download where the consumer runs. Better still, move computation to the data. MapReduce does exactly this: the master assigns map tasks to nodes that already store the input blocks, so the only bulk data crossing the network is the shuffle between map and reduce. Map-reduce in Hadoop is designed to move computation to where data is stored: true. It is designed for geographically distributed analysis: false; it is a cluster design. Failure is detected by missing heartbeats, and lost tasks are simply re-executed, which is safe because tasks are deterministic and output is committed with an atomic rename.

Networks are usually blocked: edge sites sit behind NAT, firewalls drop inbound connections, and different organizations own different sites. But outbound connections are allowed almost everywhere. So instead of the controller pushing work to machines it cannot reach, a reachable broker holds the queue, and executors connect outward and pull work. Pull also gives back-pressure: an executor only asks for work when it has free capacity.

## The twelve failure modes

The ColonyOS case study lists twelve failure modes and the design rule each leads to. Here they are, briefly.

One, the process crashes. Record it as the failed outcome of this attempt and retry while budget remains.
Two, the machine crashes. You get only silence, and dead looks the same as slow. Detect by time: give every assignment a deadline, a lease.
Three, the request is lost. Make assignment a pull: the executor simply asks again.
Four, the reply is lost. Completion must be safe to resend: the record accepts one close per attempt and ignores repeats.
Five, the network partitions. Ownership must expire on both sides: the executor stops trusting its claim when the lease ends, and the record rejects a late close from an old attempt.
Six, the machine is overloaded. Never push work; let executors pull only when they have capacity.
Seven, the process never finishes. Bound every attempt with a maximum execution time.
Eight, data arrives corrupted. Pass inputs by reference with a hash and version, and check before use.
Nine, a retry runs the process twice. Use an atomic claim so each attempt has exactly one owner, make functions idempotent, and reconcile before retrying anything with external effects.
Ten, a straggler. Use speculative execution: start a backup copy and accept the first result.
Eleven, infeasible placement, like a GPU job on a CPU-only node. Match the process's conditions against the executor's capabilities before assigning.
Twelve, the history disappears with the machine. Keep control state durably where every party can reach it, in a replicated store.

In ColonyOS, an executor sends assign with its identity and capabilities, the server matches a ready process, claims it in one atomic database update that sets state to running with a deadline, and the executor later closes it with success and an output reference, or failure and errors. A timeout loop fails or retries processes whose deadlines pass.

## A template answer for the design question

The twenty twenty five question: design a robust, scalable container orchestration framework focused on autoscaling, with a reconciliation loop that tolerates node crashes, an architecture, a figure, and a step by step scaling event. Here is a structure you can use.

Assumptions. Nodes fail by crashing, the network can delay, lose or partition messages, but not lie. So the model is non-Byzantine with partial synchrony. Clocks are not synchronized; we use leases and timeouts with margins. The control plane store has three or five members, so it survives one or two failures.

State store. A Raft-replicated key value store, like etcd, holds desired and actual state. It is the single source of truth, linearizable, with versioned objects so updates can use compare and swap. All other components are stateless and can restart from it.

API server. Stateless and horizontally replicated behind a load balancer. It validates requests, writes to the store, and streams changes to watchers.

Controllers. Each runs a level-triggered reconciliation loop: observe actual state, compare with desired, act idempotently, repeat. Use leader election through a lease in the store so only one instance of each controller acts. If it crashes, the lease expires and a standby takes over, picking up from the store.

Autoscaler. A loop that reads metrics, computes desired replicas, clamps them between a minimum and maximum, applies a stabilization window, and writes the new desired count to the store. It never creates pods directly.

Scheduler. Watches unscheduled pods, filters feasible nodes, scores them, and binds with compare and swap, so a pod is never bound twice.

Node agents. Each node heartbeats by renewing a lease. If the lease expires, the node controller marks the node not ready and its pods are rescheduled elsewhere. The agent itself reconciles locally: the containers it runs should match the pods bound to it.

Scale up, step by step. One, load rises and the metrics pipeline reports CPU above target. Two, the autoscaler computes, say, from four to six replicas, and writes six to the store. Three, the replica controller sees actual four, desired six, and creates two pod objects. Four, the scheduler binds them to nodes with free capacity. If none fit, the cluster autoscaler adds a node. Five, the node agents start containers and report ready, and the load balancer adds them. If a node crashes mid-way, its lease expires, its pods are recreated, and the loop converges anyway.

Scale down is the reverse, but slower: wait for the stabilization window, drain connections before stopping pods, and respect disruption budgets.

Then name the theory. Raft gives the consistent store. Leases handle failure detection given that slow and dead look the same. Idempotency and level triggering make retries safe. Little's law and the utilization curve justify the target utilization. Bin packing heuristics justify the scheduler. And CAP explains why the control plane chooses consistency, while the data plane, the running pods, keeps serving even if the control plane is briefly unavailable.

## Quick review

Workflow is the specification, scheduling is the decision, orchestration is the loop. Span bounds the makespan; schedule the critical path first. Kubernetes: API server, etcd with Raft, scheduler with filter, score and bind, controllers with reconciliation loops, kubelets on the nodes. Reconciliation is observe, compare, act, repeat: level triggered and idempotent. Placement is NP-hard bin packing, solved by heuristics. Waiting time explodes near full utilization. And failures are silence, so use leases, pull, idempotent completion and a durable record.

That is the end of the series. Good luck on the exam.

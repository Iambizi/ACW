# Warden Console: System Design & Architecture
> An Agentic Interface for Permissionless Liquidities

## 1. Executive Summary
The Warden Console is a next-generation consumer Web3 interface designed to abstract away the friction of traditional decentralized applications (dApps). By converging **Account Abstraction (ERC-4337)** and **Agentic AI UI Patterns**, Warden allows users to interact with high-complexity DeFi primitives (swaps, bridging, transfers) using natural language, without ever handling raw transaction calldata, gas tokens, or seed phrases. 

Our core philosophy: *Crypto infrastructure should be designed for developers. Crypto interfaces should be designed for humans.*

## 2. Core Architecture Thesis
Warden is built on a **Headless Architecture** prioritizing strict separation of concerns:
- **`@warden/core` (State & Intelligence):** A pure, unopinionated TypeScript core. It houses the LLM intent routing, block simulation, Zustand state machines, and formatting logic. It has zero knowledge of the DOM or React.
- **`@warden/ui` (Oversight Primitives):** A visual presentation layer powered by the open-source `Depute` component library, dictating how human-in-the-loop (HITL) gates are visually rendered.

This decoupling ensures that the visual design can undergo massive generational overhauls without ever risking the stability of the underlying transaction safety guarantees or the AI routing pipeline.

## 3. The intent Pipeline (Data Flow)

When a user submits a natural language intent (e.g., *"Swap 100 USDC for WETH"*), the system executes a deterministic sequence:

1. **Intent Parsing (LLM Layer)**: The raw string is piped to an Anthropic `claude-haiku` agent with strict JSON schema enforcement via `@google/genai` or `@anthropic-ai/sdk`. The LLM maps the natural language to a structured primitive (e.g., `SWAP_EXACT_IN`).
2. **Quote Generation**: The structured intent invokes the `ZeroEx` Route API (or 1inch), fetching deterministic, optimal liquidity routing calldata.
3. **Execution Simulation (`eth_call`)**: Before the user ever sees a prompt, `@warden/core` uses `viem` to simulate the transaction aggressively against an archive node. Reverts trigger a `DRAFT -> FAILED` state transition, protecting the user from signing bound-to-fail execution paths.
4. **Proposal Formulation**: A `ProposalObject` is constructed containing the execution path, AI confidence targets, risk assessments, and the underlying tooling traces, which is then moved to `PENDING_APPROVAL`.

## 4. Human-In-The-Loop (HITL) & Agentic Safety
Traditional crypto applications rely on blind-signing hexadecimal strings. Warden leverages the **Depute Component Taxonomy** to establish bounded, informed consent.

- **Approval Gates**: Every AI-generated proposal halts executing at a deterministic `ApprovalGate`. 
- **Confidence Scoring & Tool Tracing**: The LLM's raw tool-call traces and normalized confidence scores (0-100) are rendered within the gate. This enforces Progressive Disclosure — advanced users can audit the precise `inputs` and `outputs` the agent generated, while standard users rely on high-level risk badges.
- **Deterministic Routing**: The AI *never* generates autonomous executable calldata. It only outputs parameters, which are strictly verified and compiled into raw transactions securely away from the prompt context.

## 5. Account Abstraction & Gas Elimination (EIP-5792)
Cryptocurrency's largest UX barrier is the bridging and raw gas fee lifecycle. Warden completely bypasses this through the **Coinbase Smart Wallet** and **ERC-4337 Paymaster infrastructure**.

- **EIP-5792 Capabilities**: By exposing `capabilities: { paymasterService: { url } }` within our `wagmi` / `viem` execution hooks, we effectively instruct the Smart Wallet to route the transaction bundle through a sponsoring paymaster.
- **Zero-Balance Execution**: Users do not need ETH or base network tokens to pay for gas. The Warden backend sponsors execution costs, transforming "Web3 mechanics" into standard "Web2 push-button" execution.

## 6. Durable State (Zustand Persist)
Asynchronous human-in-the-loop workflows demand durability. Bounded `zustand` stores infused with the `persist` middleware ensure that the user's local `warden-proposals-storage` is resilient to page unmounts, hard refreshes, and long-tail async handoffs (`HANDOFF_PENDING`), guaranteeing that oversight decisions are never lost in transit.

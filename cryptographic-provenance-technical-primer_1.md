**Cryptographic Provenance for Canadian Supply Chains**
*Technical Primer*
## About this document
This primer is for accepted participants of the Cryptographic Provenance hackathon. It covers the problem you'll work on, the concepts to know going in, and how to prepare. You'll get the full technical specification at the start of the event: attestation schema, supplier registry, sample data, and submission interface. Nothing here locks in those details, so treat it as orientation, not implementation guidance.
# Why verifiable origin matters
The Buy Canadian Policy raised the weight on origin claims. "Made in Canada" and "Product of Canada" labels now drive procurement decisions, including the defense and dual-use goods the Canadian Armed Forces buys.
Origin claims rest on supplier self-reporting. A company prints "Made in Canada" on a label, and no one can check whether the claim holds. Goods move through multi-tier supply chains: raw materials from one country, components from another, assembly somewhere else. Reconstructing the real origin afterward is close to impossible, because the records, where they exist at all, sit scattered across companies, formats, and incentives.
Your system addresses this: how do you establish provenance at the source so it stays tamper-evident and auditable, and a buyer can trust it enough to make a procurement decision?
The Canadian drone sector is the use case, though the principles carry well beyond it.
# The problem in plain terms
Take a finished drone. Building it drew on dozens of suppliers across several tiers: raw material extractors, component manufacturers, subassembly integrators, and a final assembler. Every supplier contributed materials, labour, or both, worked in some country, and charged for the contribution.
To decide whether the finished drone qualifies as "Made in Canada," you need to know:
- What every supplier did
- What it cost (materials and labour, separately)
- Where the work happened
- Whether each supplier's claims hold up
- Whether anyone altered the records
None of this is available today. Your task: build a system that records every supplier contribution as a **cryptographically signed attestation**. An attestation is a structured record bound to the supplier's verified identity, and no one can change it after signing without leaving a trace. Each attestation references the ones it consumed (raw materials feeding a component, components feeding an assembly), which forms a chain of custody from raw material to finished product.
When a buyer wants to verify a product's origin, the system walks the chain, checks every signature, computes the cost contributions, and returns an answer.
# The Canadian content rules
The Competition Bureau defines two designations for non-food products:
**Product of Canada** requires that at least 98% of total direct production costs (materials and labour) occurred in Canada, and that the last substantial transformation of the product happened in Canada.
**Made in Canada** requires that at least 51% of total direct production costs occurred in Canada, and that the last substantial transformation happened in Canada.
"Substantial transformation" means a manufacturing step that changes the form or nature of the inputs: fabric becomes a parachute, raw aluminum becomes a motor housing, components become an integrated subsystem. The event-day spec will define how to identify substantial transformations from attestation data.
Your system computes the right designation for a product from its attestation chain. Doing this correctly across a multi-tier graph is part of the technical work: costs accumulate through the tiers, and you have to attribute each one to the right country.
# What you'll be building
Your submission has three components, packaged as a single repository:
**A verification backend.** An HTTP service that ingests attestation data, verifies cryptographic integrity, walks the supply chain, computes Canadian content percentages and designations, and reports any anomalies. This is the core of the system, and the automated scoring harness evaluates it.
**A supplier interface.** A web UI where suppliers issue new attestations: they select their inputs, record costs and labour, sign with their identity, and submit. This shows the full attestation lifecycle.
**A purchaser interface.** A web UI with QR-code scanning that lets someone look up a product and see its provenance, Canadian content percentage, designation, and any flagged integrity issues, all readable by a non-technical user.
Pick your own stack. You'll submit a Docker Compose project so the scoring harness can run every backend the same way. AI coding assistants are allowed and expected. Use them for boilerplate, and save your time for the parts of the problem that decide your score.
# The verification problem
Verifying a clean, well-formed supply chain is mechanical: check each signature, sum costs by country, apply the thresholds. The hard work starts when the data is incomplete, manipulated, or adversarial. The test cases span categories like these:
- **Integrity violations**: attestations someone modified after signing, or signed by a party not in the verified supplier registry
- **Replay and reuse**: attestations from one product's chain dropped into another, or referenced in ways that don't match what physically happened
- **Quantity inconsistencies**: a chain claims more material consumed than upstream suppliers ever produced
- **Structural problems**: missing references, broken links, or impossible orderings
- **Incomplete data**: some attestations lack required fields, and your system has to handle the uncertainty without falling over
A strong system catches these cases, classifies each one, and still produces useful output where it can. A weak one accepts invalid chains, misses subtle attacks, or breaks on edge cases. The difference between teams comes down to how far you think through what can go wrong and how the system holds up when it does.
# What to expect on event day
At kickoff, you'll get:
- The full technical specification: attestation schema, canonical serialization rules, and computation requirements
- A supplier registry with mock verified identities and cryptographic keys
- A reference library for signing and verifying attestations
- Sample attestation chains with expected outputs, for self-testing
- A self-test harness for checking your submission against representative cases before the deadline
- Submission format details and the deadline
You build and submit within the event window. After you submit, an automated scoring harness runs your backend against a held-out test suite. Scoring covers three things: correctness of the Canadian content computation, accuracy of anomaly detection, and handling of edge cases. The supplier and consumer interfaces count toward the overall submission and demo, but the harness does not score them.
# Suggested preparation
You won't invent cryptographic primitives or design schemas from scratch; we provide those. Coming in familiar with the underlying concepts and tools will save you time.
**Concepts worth a refresher:**
- Public-key cryptography and digital signatures (Ed25519, which the reference library uses)
- Hashing and content addressing
- Directed acyclic graphs and graph traversal
- Trust models and threat modeling: reasoning about what an attacker can and can't do
**Real-world frameworks worth a glance:**
You won't implement these, but seeing how the industry approaches supply chain provenance builds useful design intuition. Links are in the References section.
- in-toto: supply chain integrity framework for software, with signed steps and link metadata
- SLSA: supply chain security levels framework, born in software and spreading to other domains
- C2PA: content provenance and authenticity, the same cryptographic ideas applied to media
**Tools to have ready:**
- Docker and Docker Compose, installed and tested
- A backend language and framework you know well that can produce a containerized HTTP service
- A frontend framework you already know well
- Working QR-code scanning in a browser. Browser camera APIs need HTTPS or localhost, so test this ahead of time.
# References and further reading
- : the enforcement guidelines that define the two designations
- : supply chain integrity framework
- : supply chain security levels framework
- : content provenance and authenticity

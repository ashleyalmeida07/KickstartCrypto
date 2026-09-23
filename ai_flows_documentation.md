# KickstartCrypto AI Flows Documentation

The KickstartCrypto platform relies on a sophisticated AI backend powered by **LangGraph** and **CrewAI**. These agents work autonomously to protect backers from scams, handle customer support, verify milestone deliverables, and generate platform analytics.

This document outlines how each of the AI flows operates under the hood.

---

## 1. Flow 1: Campaign Vetting & Risk Scoring (`campaign_vetting.py`)

**When it runs:** Automatically triggered immediately after a creator launches a new campaign on the platform.
**Purpose:** To protect the platform from scams, phishing, and fraudulent campaigns before backers contribute heavily.

### Step-by-Step Process:
1. **Extract Campaign Data:** The agent reads the new campaign's title, description, and financial goals.
2. **Check Wallet History:** The agent queries the Sepolia blockchain (via Etherscan) to investigate the creator's wallet. It checks for red flags like brand-new wallets with zero history or wallets associated with known bad actors.
3. **Content Authenticity Check:** An AI model scans the campaign description for common scam patterns, overly aggressive promises, or plagiarized text.
4. **Risk Scoring:** The agent combines the on-chain wallet data with the AI content analysis to generate a final **Trust Score**.
5. **Verdict:**
   - **Low Risk:** The campaign is allowed to proceed normally.
   - **High Risk:** The campaign is flagged in the Admin Dashboard for human review or paused automatically.

---

## 2. Flow 2: Donor Support & Dispute Resolution (`donor_graph.py`)

**When it runs:** Triggered whenever a backer submits a message via the "AI Support" tab on a campaign page.
**Purpose:** To provide instant customer support, answer campaign-specific questions, and automatically process refund eligibility.

### Step-by-Step Process:
1. **Classify Intent:** The AI analyzes the user's message to determine if they are asking a general question, reporting fraud, or requesting a refund.
2. **Fetch Transaction Context:** The agent queries the database and the blockchain to verify if the user actually contributed to this campaign, and if so, how much.
3. **Policy Check (Refunds):** If the user is asking for a refund, a strict rules engine checks the platform's refund policy (e.g., *Is the campaign canceled? Did it fail to reach its goal?*).
4. **Draft Response:** The AI generates a customized, polite response based on the campaign's data and the user's specific transaction history.
5. **Send or Escalate:**
   - The AI responds instantly to the user on the frontend.
   - If the request is highly complex or aggressive, the agent automatically halts and escalates the ticket to a human Admin.

---

## 3. Flow 3: Milestone Proof Verification (`milestone_graph.py`)

**When it runs:** Triggered when a creator uploads a receipt, invoice, or document to unlock the next tranche (chunk) of their funding.
**Purpose:** To ensure creators are actually spending money on what they promised before releasing more funds from the smart contract.

### Step-by-Step Process:
1. **Extract Milestone Claim:** The agent pulls the original roadmap to see exactly what the creator promised to deliver for this specific milestone.
2. **Parse Proof (Vision AI):** The agent uses a Vision AI model with Optical Character Recognition (OCR) to "read" the uploaded image, receipt, or PDF to extract dates, items, and costs.
3. **Cross-Check On-Chain Spend:** The agent scans the creator's wallet on the blockchain to verify that the ETH they claim to have spent actually left their wallet.
4. **Consistency Check:** The AI compares the receipt data against the original milestone promise. *(e.g., if the milestone was for 'marketing', but the receipt is for a 'coffee machine', it flags it).*
5. **Confidence Scorer & Conditional Router:** 
   - **High Trust:** If the receipt and blockchain spend match perfectly, the agent automatically signs a transaction to the smart contract to release the funds directly to the creator.
   - **Ambiguous:** If the amounts drift slightly, the proof is queued in the Admin Dashboard for a human to manually review.
   - **Low Trust / Scam:** If the proof is irrelevant or entirely mismatched, the agent rejects the submission and keeps the funds locked safely in the smart contract.

---

## 4. Admin Reporting Team (CrewAI)

**When it runs:** Triggered on-demand when a platform Admin clicks "Generate Report" in the Admin Dashboard.
**Purpose:** To provide deep platform analytics, growth strategies, and a beautiful markdown report without human effort.

### The Agent Team:
This flow uses **CrewAI**, which spins up a team of three distinct AI personas that talk to each other:
1. **The Data Analyst:** Uses custom tools to query the database, fetching the total volume raised, active user counts, and the most successful campaigns.
2. **The Strategist:** Takes the Analyst's raw data, identifies trends (e.g., "Gaming campaigns are up 40%"), and proposes actionable marketing strategies.
3. **The Executive Admin:** Takes the insights from the Strategist and the data from the Analyst, compiling them into a professionally formatted Markdown document that is saved directly to the Admin Dashboard.

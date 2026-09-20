<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

1. Intent Classification (classify_intent)
First, the AI reads the message and categorizes it into one of four buckets:

refund_request
status_inquiry
fraud_report
general_question
2. Context Gathering (fetch_transaction_context)
No matter what the backer asked, the agent reaches into your Postgres database to pull the facts. It checks the backer's wallet address to see exactly how much they donated, when they donated, and what the current status/deadline of the campaign is. This ensures the AI always answers based on real transaction data.

3. Policy Check (policy_check)
(This step only runs if the backer is asking for a refund). Instead of letting the AI guess if a refund is allowed, a strict rules engine checks the platform's refund policies. It checks: Did the campaign fail its funding goal? Is it within the allowed refund window?

4. Drafting the Response (draft_response)
The AI generates a polite reply based only on the facts it gathered in Step 2 and the policy rules from Step 3.

5. The Escalation Gate (Human-in-the-Loop)
This is the most important part of the flow. Before sending the response to the user, the graph checks to see if it needs a human admin. It will pause itself and escalate to your admin queue if:

The message was a fraud_report (these are always escalated to humans).
The AI is unsure or the policy rules were ambiguous.
If it gets escalated, the flow stops. A human admin can step in, read the AI's drafted response, edit it, and approve it. Once approved, the graph resumes exactly where it left off.

6. Sending the Final Response (send_response)
If the message was simple (like a status inquiry) and didn't need escalation, or if a human admin just approved an escalated ticket, the final response is delivered back to the backer in the UI!

It's essentially a smart customer service rep that handles the easy questions automatically but escalates the dangerous ones (fraud/refunds) to you. Would you like to try testing it right now on one of your campaigns, or should we move on to building out the Admin Dashboard reporting?
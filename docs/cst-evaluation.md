# Try the CST prototype

Open http://localhost:8080 and refresh if you still see the maintenance screen. Use the configured `DEMO_PASSWORD`. New installations default to the example password in `.env.example`; existing accounts retain their current password.

## A 15-minute CST walkthrough

1. Sign in as **requester@example.com**. Create a trouble ticket called “Sample workstation cannot connect to VPN.” Enter a fictional device such as DEMO-LAPTOP and describe the observed symptoms.
2. Sign out and sign in as **supervisor@example.com**. In **CST Service Desk**, open the ticket, select Jordan Ellis under **Assign agent**, set its priority, and save.
3. Sign in as **technician@example.com**. Find the ticket in **Assigned to me**. Move it to **In progress** and enter an internal troubleshooting note.
4. Post a separate requester-visible reply. Mark the ticket **Blocked** while waiting for an action, then return it to **In progress** when ready.
5. Sign in as the requester. Confirm the public reply is visible and the internal note is not. Add a reply.
6. Sign in as the agent and move the ticket to **Completed**. Post a public resolution explanation.
7. Sign in as the supervisor and move it to **Closed**. Confirm its history remains available and edits are disabled.
8. Filter the CST queue by status or priority and export a CSV.

## Optional handoff

As CST staff, open a ticket and choose **Create linked task**. Enter only the details needed by the receiving team. A software bug can go to Development. A security task goes to Cybersecurity automatically and is restricted.

Use **developer@example.com**, **cyber@example.com**, or **operations@example.com** to inspect the destination queue. CST creators can see ordinary tasks they submitted, but the owning team controls workflow updates. Cybersecurity details are visible only to cybersecurity staff and administrators, including in reports and links.

## Evaluate whether it fits your work

Record observations for a handful of fictional tickets:

| Question | Notes |
| --- | --- |
| Can you capture the request without missing required information? | |
| Is the correct owner obvious at every stage? | |
| Are the statuses useful, and what is missing? | |
| Is it clear which notes the requester can see? | |
| Can you find unassigned, overdue, and blocked work quickly? | |
| Can a requester tell what happens next? | |
| What would still need a spreadsheet, email, or another system? | |

Start with synthetic or sanitized scenarios. Before entering actual workplace information, confirm the data and deployment are permitted by your organization. The app currently uses demo accounts, sample-only attachments, and in-app notifications; it has no email delivery, SSO, account recovery, or SLA engine.

The most useful next changes are the ones that remove friction you encounter during this walkthrough.

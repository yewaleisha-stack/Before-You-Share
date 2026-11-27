// Synthetic data only. Emails use RFC 2606 example domains; IPs use documentation ranges.
export const SAMPLE_NAME = 'sample-ticket.txt';
export const SAMPLE = `Ticket #48213 · Payment failed after address change
Opened 2026-11-27 10:42 IST · Agent: support-bot

From: Ananya Rao <ananya.rao@example.com>
Phone: +91 98765 43210
PAN: ABCPE1234F   Aadhaar: 2345 6789 0123

Customer message:
"My card 4111 1111 1111 1111 was charged twice. Please call me on
09876543210 or email Ananya.Rao@example.com. My husband's card
5555 5555 5555 4444 works fine."

Agent notes:
- Order ref 4111 1111 1111 1112 (not a card number)
- Escalated to billing.ops@example.org, cc ananya.rao@example.com
- Login IPs: 203.0.113.42, 203.0.113.42, 198.51.100.7
- Gateway log: client=2001:db8::8a2e:370:7334 status=402
- Values rejected by the form: 256.12.4.1, 1234 5678 9012
- Rendered field: <img src=x onerror=alert(1)>
`;

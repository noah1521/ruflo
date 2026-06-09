# Z&N adVentures — Mistake Log

> This file is NEVER deleted. Every error is logged permanently. This is how we get better.
> ZN-Risk reads this before EVERY recommendation. ZN-Memory embeds every entry for pattern matching.

---

## Log

### Mistake #1 — 2026-06-08
**What happened**: Deployed META without running 72-hour news sweep first.  
**What was missed**: FT reported an equity offering for META ~June 5. Stock fell before we deployed.  
**Why it was wrong**: A standard news sweep would have caught this dilution signal and prevented the trade.  
**Rule created**: ALWAYS run full 72hr news sweep on every ticker before any execution. No exceptions.  
**Status**: Rule #4 in strategy_rules.md

---

### Mistake #2 — 2026-06-08
**What happened**: Promised live options Greek data (delta, gamma, IV) to fund owner without first verifying that the data source was accessible.  
**What was missed**: We did not have a confirmed real-time options data feed at time of promise.  
**Why it was wrong**: Promising data we cannot deliver erodes trust and leads to bad decisions.  
**Rule created**: Never reference or promise data points that cannot be verified in real time from a confirmed source.  
**Status**: Active rule

---

### Mistake #3 — 2026-06-08
**What happened**: Referenced incorrect capital figures during allocation discussion.  
**What was missed**: Did not confirm actual buying power from Robinhood before discussing position sizing.  
**Why it was wrong**: Wrong capital figures lead to wrong position sizes and potential overdeploy.  
**Rule created**: Always confirm live buying power from Robinhood account before any allocation discussion.  
**Status**: Active rule — buying power confirmed at start of every session

---

### Mistake #4 — 2026-06-09
**What happened**: Did not pull options order history on portfolio check-in.  
**What was missed**: Full position picture requires both equity AND options orders. Skipping options history gives incomplete portfolio view.  
**Why it was wrong**: Incomplete portfolio view can lead to incorrect capital calculations and missed open positions.  
**Rule created**: Always check full order history including options on every portfolio review.  
**Status**: Active rule — ZN-Risk includes options history in every audit

---

*Total mistakes logged: 4*  
*Mistakes repeated: 0*  
*Rules created from mistakes: 4*

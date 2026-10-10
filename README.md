# Contingency

A personal injury law firm tycoon that runs in the browser. Start as a single attorney working out of a spare bedroom and build a multi-office dynasty with your name on a tower and a successor in your chair.

The whole game is plain HTML, CSS and JavaScript. There is no build step and nothing to install.

## Play

- Open `index.html` in a browser, or
- open `dist/contingency.html`, which is the same game bundled into one file you can email or host anywhere.

The game autosaves to the browser every week. The Menu button lets you copy a save as text and paste it into another browser.

## How the game works

Every case follows the life of a real personal injury claim:

1. **Intake.** Leads arrive from marketing, referrals and past clients. Screen them for liability, injuries, coverage and the statute of limitations. Sign, decline, refer out for a fee, or spend $150 to investigate first.
2. **Investigation.** Letters of representation, police reports, photographs, witnesses, preservation letters for video and black-box data, policy-limits requests, the client's own UM/UIM and med-pay coverage, and the carrier's liability position.
3. **Treatment.** The client treats until maximum medical improvement. Gaps in care hurt value. Specialist referrals on letters of protection and recommended surgeries raise value and add liens.
4. **Records.** Records and bills from every provider, each with its own delay and copying fee.
5. **Demand.** You pick the number. Demand below the carrier's reserve and they simply pay it. Time-limited policy-limits demands set up bad-faith exposure when the carrier misses the deadline.
6. **Negotiation.** Adjusters with different personalities working for carriers with different reputations. Counter, escalate to a supervisor, or file suit.
7. **Litigation.** Filing, service, answer, written discovery, depositions, defense medical exams, expert retention, summary judgment, mediation, continuances, courthouse-steps offers, trial, verdict, appeal and collection. Fees convert from a third to forty percent.
8. **Disbursement.** Settlement statement with fee, costs, liens (health plans, ERISA, Medicare, Medicaid, hospital liens, letters of protection, workers' comp, med-pay, even child support) and the client's net. Negotiate the liens down; every dollar goes to the client, and happy clients send referrals.

Around the cases you run the firm: hiring attorneys, trial lawyers, paralegals, case managers, intake specialists, investigators, lien negotiators and management; marketing across ten channels; office upgrades and satellite offices in other cities; a line of credit, owner's draw and malpractice insurance; random events from kickback offers to tort reform; and firm tiers from solo practitioner to national dynasty. The founder ages, names a successor and retires, and the next generation carries on.

Delegate files to associates and they run them with their own judgment. Keep files hands-on and every demand, offer and lien decision is yours.

## Files

- `index.html`, `styles.css` and `js/` are the game.
- `js/data.js` holds all the tuning data: case types, injuries, insurers, adjusters, staff roles, offices, marketing channels, tiers, events.
- `js/cases.js` is the case engine. `js/firm.js` is the firm layer and weekly tick. `js/ui.js` renders. `js/main.js` wires it together.
- `node build.js` writes `dist/contingency.html`.

Everything in the game is fictional. Insurers, courts, cities and people are invented, and nothing in it is legal advice.

/* Contingency: static game data. Every insurer, court and city here is fictional. */
(function () {
  const PI = (globalThis.PI = globalThis.PI || {});
  const D = (PI.DATA = {});

  D.FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Jennifer', 'William', 'Elizabeth', 'Carlos', 'Susan', 'Jose', 'Karen', 'Daniel', 'Nancy', 'Luis', 'Angela', 'Kevin', 'Sandra', 'Brian', 'Ashley', 'Marcus', 'Kimberly', 'Andre', 'Emily', 'Tyrone', 'Donna', 'Hector', 'Michelle', 'Jamal', 'Carol', 'Wei', 'Amanda', 'Raj', 'Melissa', 'Omar', 'Deborah', 'Dmitri', 'Stephanie', 'Ahmed', 'Rebecca', 'Kenji', 'Sharon', 'Diego', 'Laura', 'Trevor', 'Cynthia', 'Darnell', 'Kathleen', 'Felix', 'Amy', 'Ivan', 'Shirley', 'Mateo', 'Anna', 'Grant', 'Brenda', 'Victor', 'Pamela', 'Owen', 'Nicole', 'Terrence', 'Helen', 'Priya', 'Samantha', 'Nguyen', 'Katherine', 'Lamar', 'Christine', 'Esteban', 'Debra', 'Gabriel', 'Rachel', 'Hugo', 'Janet', 'Caleb', 'Catherine', 'Ruben', 'Maureen', 'Dante', 'Frances', 'Ezra', 'Ann', 'Noah', 'Joyce', 'Isaiah', 'Diane', 'Leo', 'Alice', 'Rosa', 'Julie', 'Aiden', 'Heather', 'Sofia', 'Teresa'];
  D.LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Okafor', 'Singh', 'Chen', 'Kowalski', 'Nakamura', 'Haddad'];

  D.BUSINESS_NAMES = ['Northgate Logistics', 'Big Country Freight', 'Redwood Grocers', 'Metro Transit Authority', 'Sunbelt Property Group', 'Harborview Apartments LLC', 'QuickMart #114', 'Ridgeline Construction', 'Lone Pine Trucking', 'Lakeside Senior Living', 'Pioneer Rideshare Inc.', 'Cascade Medical Center', 'Granite Peak Builders', 'Blue Canyon Hotels', 'Summit Steel Fabrication', 'Valley Regional Hospital', 'Everbright Retail Corp.', 'Tri-County Paving', 'Coastline Delivery Co.', 'Oakmont Shopping Plaza'];

  // Where the firm practices. Venue multiplier affects jury awards and adjuster reserves. Court backlog in weeks from filing to trial.
  D.CITIES = [
    { id: 'portavalon', name: 'Port Avalon', pop: 'Large metro', venue: 1.25, backlog: 95, leadBase: 1.3, costOfLiving: 1.3, desc: 'Big urban juries, generous verdicts, fierce competition and TV lawyers on every bus.' },
    { id: 'riverton', name: 'Riverton', pop: 'Mid-size city', venue: 1.0, backlog: 75, leadBase: 1.0, costOfLiving: 1.0, desc: 'Balanced venue. Reasonable juries, moderate backlog, a healthy mix of referral work.' },
    { id: 'fairmont', name: 'Fairmont County', pop: 'Suburban county', venue: 0.8, backlog: 60, leadBase: 0.8, costOfLiving: 0.9, desc: 'Conservative juries that distrust plaintiffs. Cheap rent, quick dockets, lower verdicts.' },
    { id: 'highdesert', name: 'High Desert', pop: 'Rural region', venue: 0.9, backlog: 50, leadBase: 0.6, costOfLiving: 0.75, desc: 'Trucking corridors and oil-field accidents. Few lawyers, big commercial policies, long drives.' },
    { id: 'gulfshore', name: 'Gulf Shore', pop: 'Coastal metro', venue: 1.15, backlog: 85, leadBase: 1.15, costOfLiving: 1.1, desc: 'Tourists, scooters, hurricanes and premises cases. Plaintiff-friendly but flood-prone.' },
    { id: 'steel', name: 'Steel City', pop: 'Industrial metro', venue: 1.1, backlog: 80, leadBase: 1.05, costOfLiving: 0.95, desc: 'Union town. Juries respect injured workers. Heavy industry means serious injuries.' }
  ];

  D.FOUNDER_BACKGROUNDS = [
    { id: 'defense', name: 'Insurance defense defector', desc: 'Eight years defending carriers. You know every adjuster trick and most of the adjusters.', cash: 60000, skills: { negotiation: 7, litigation: 5, client: 4, management: 5 }, age: 36 },
    { id: 'pd', name: 'Former public defender', desc: 'Two hundred jury trials on a government salary. Broke, fearless, and great in front of twelve strangers.', cash: 25000, skills: { negotiation: 4, litigation: 8, client: 6, management: 3 }, age: 34 },
    { id: 'biglaw', name: 'Big Law refugee', desc: 'Six years billing 2,400 hours a year. Savings, polish, no idea how to talk to a client who drives a forklift.', cash: 140000, skills: { negotiation: 5, litigation: 6, client: 3, management: 6 }, age: 33 },
    { id: 'grad', name: 'Fresh bar passer', desc: 'Sworn in last month. Student loans, a laptop, a borrowed desk and nothing to lose.', cash: 15000, skills: { negotiation: 3, litigation: 3, client: 6, management: 3 }, age: 27 },
    { id: 'pi_assoc', name: 'PI mill associate', desc: 'Five years churning soft-tissue cases at a volume firm. You know the business cold and want your own name on the door.', cash: 45000, skills: { negotiation: 6, litigation: 4, client: 5, management: 6 }, age: 32 }
  ];

  // Insurers. style: 0 = pays fair value quickly, 1 = hardball. defenseSpend affects litigation reserve growth.
  D.INSURERS = [
    { id: 'statewide', name: 'Statewide Farm & Auto', style: 0.45, share: 18, desc: 'Largest carrier. Process-driven, formula offers, moves when the paper is right.' },
    { id: 'redline', name: 'Redline Auto Casualty', style: 0.85, share: 14, desc: 'Minimum-limits specialist. Denies first, lowballs second, pays limits only at the courthouse steps.' },
    { id: 'horizon', name: 'Horizon Mutual', style: 0.35, share: 12, desc: 'Regional mutual with a reputation to protect. Fair reserves, quick checks.' },
    { id: 'granite', name: 'Granite State Insurance', style: 0.6, share: 12, desc: 'Mid-market. Uses software valuation that punishes treatment gaps and chiropractors.' },
    { id: 'sentinel', name: 'Sentinel Indemnity', style: 0.7, share: 10, desc: 'Litigation-happy. Would rather pay defense counsel than a plaintiff.' },
    { id: 'beacon', name: 'Beacon General', style: 0.5, share: 10, desc: 'Big national book. Adjuster quality varies wildly by desk.' },
    { id: 'veterans', name: 'Veterans Mutual', style: 0.3, share: 6, desc: 'Members-only carrier. Treats claimants decently, rarely plays games.' },
    { id: 'cornerstone', name: 'Cornerstone Commercial', style: 0.65, share: 9, desc: 'Commercial general liability and premises. Deep pockets, deep discovery.' },
    { id: 'meridian', name: 'Meridian Trucking Underwriters', style: 0.75, share: 5, desc: 'Million-dollar motor carrier policies and rapid-response defense teams at every crash scene.' },
    { id: 'medpro', name: 'Physicians Assurance Trust', style: 0.8, share: 4, desc: 'Doctor-owned malpractice carrier. Consent-to-settle clauses mean almost everything gets tried.' }
  ];

  D.ADJUSTER_STYLES = [
    { id: 'rookie', name: 'Rookie', mod: -0.08, patience: 5, desc: 'Six months on the desk. Over-relies on the software, scared of the supervisor.' },
    { id: 'veteran', name: 'Veteran', mod: 0.0, patience: 4, desc: 'Twenty years of files. Knows what the case is worth and what you will take.' },
    { id: 'hardball', name: 'Hardball', mod: 0.12, patience: 3, desc: 'Takes pride in paying less than the last adjuster. Dares you to file.' },
    { id: 'reasonable', name: 'Reasonable', mod: -0.12, patience: 5, desc: 'Wants the file closed. Will pay fair value if you give them a reason.' },
    { id: 'overloaded', name: 'Overloaded', mod: 0.04, patience: 6, desc: 'Three hundred open files. Slow to respond, but caves when pressed with deadlines.' }
  ];

  // Policy limit tiers (per-person bodily injury) and relative frequency for personal auto policies.
  D.AUTO_LIMITS = [
    { w: 32, v: 25000, label: '25/50 (state minimum)' },
    { w: 20, v: 50000, label: '50/100' },
    { w: 24, v: 100000, label: '100/300' },
    { w: 14, v: 250000, label: '250/500' },
    { w: 7, v: 500000, label: '500/1M' },
    { w: 3, v: 1000000, label: '1M + umbrella' }
  ];

  // Case types. sol in days. liability profile = distribution of clear/disputed/weak. limitsKind picks coverage table.
  D.CASE_TYPES = {
    rearend: { name: 'Rear-end collision', short: 'Auto (rear-end)', cat: 'auto', w: 26, liab: { clear: 0.75, disputed: 0.2, weak: 0.05 }, limits: 'auto', sol: 730, sevW: [52, 33, 12, 2.5, 0.5], costMult: 1.0, desc: 'Client was stopped or slowing when struck from behind. Presumption of fault favors you.' },
    intersection: { name: 'Intersection crash', short: 'Auto (intersection)', cat: 'auto', w: 16, liab: { clear: 0.35, disputed: 0.45, weak: 0.2 }, limits: 'auto', sol: 730, sevW: [38, 37, 18, 6, 1], costMult: 1.1, desc: 'Who had the green? Both drivers swear they did. Witnesses and camera footage decide it.' },
    dui: { name: 'Drunk-driver collision', short: 'Auto (DUI)', cat: 'auto', w: 4, liab: { clear: 0.9, disputed: 0.08, weak: 0.02 }, limits: 'auto', sol: 730, sevW: [20, 35, 28, 13, 4], costMult: 1.0, punitive: true, desc: 'Defendant blew a .14 at the scene. Punitive exposure makes carriers nervous.' },
    motorcycle: { name: 'Motorcycle crash', short: 'Motorcycle', cat: 'auto', w: 5, liab: { clear: 0.4, disputed: 0.4, weak: 0.2 }, limits: 'auto', sol: 730, sevW: [12, 28, 32, 20, 8], costMult: 1.1, biasMult: 0.9, desc: 'Car turned left across the rider. Serious injuries, but juries carry a bias against bikers.' },
    pedestrian: { name: 'Pedestrian struck', short: 'Pedestrian', cat: 'auto', w: 4, liab: { clear: 0.5, disputed: 0.35, weak: 0.15 }, limits: 'auto', sol: 730, sevW: [15, 30, 30, 18, 7], costMult: 1.0, desc: 'Client hit in or near a crosswalk. Was the light with them? Were they looking at a phone?' },
    rideshare: { name: 'Rideshare passenger', short: 'Rideshare', cat: 'auto', w: 4, liab: { clear: 0.85, disputed: 0.12, weak: 0.03 }, limits: 'rideshare', sol: 730, sevW: [45, 35, 15, 4, 1], costMult: 1.0, desc: 'Passenger in an app-dispatched car. A $1M commercial policy applies while the trip is active.' },
    trucking: { name: 'Commercial truck collision', short: 'Trucking', cat: 'auto', w: 3, liab: { clear: 0.55, disputed: 0.35, weak: 0.1 }, limits: 'commercial', sol: 730, sevW: [10, 25, 32, 22, 11], costMult: 1.5, desc: 'An 80,000-pound tractor-trailer. Federal regulations, driver logs, black-box data and a rapid-response defense team.' },
    premises: { name: 'Slip and fall', short: 'Premises', cat: 'premises', w: 12, liab: { clear: 0.2, disputed: 0.45, weak: 0.35 }, limits: 'cgl', sol: 730, sevW: [35, 38, 20, 6, 1], costMult: 1.2, biasMult: 0.85, desc: 'Wet floor, no cone. Notice is everything: did the store know, and for how long?' },
    dogbite: { name: 'Dog bite', short: 'Dog bite', cat: 'premises', w: 5, liab: { clear: 0.7, disputed: 0.25, weak: 0.05 }, limits: 'homeowner', sol: 730, sevW: [40, 40, 16, 3.5, 0.5], costMult: 0.9, desc: 'Strict liability in this state. Covered by the owner\'s homeowner policy, if they have one.' },
    negligent_security: { name: 'Negligent security', short: 'Neg. security', cat: 'premises', w: 1, liab: { clear: 0.2, disputed: 0.4, weak: 0.4 }, limits: 'cgl', sol: 730, sevW: [8, 25, 35, 22, 10], costMult: 1.4, desc: 'Assault in an apartment complex with broken gates and no lighting. Tough liability, big damages.' },
    workplace_third: { name: 'Construction site injury', short: 'Construction', cat: 'premises', w: 3, liab: { clear: 0.35, disputed: 0.45, weak: 0.2 }, limits: 'commercial', sol: 730, sevW: [10, 27, 35, 20, 8], costMult: 1.3, desc: 'Third-party claim against a general contractor or subcontractor. Comp lien will want its money back.' },
    medmal: { name: 'Medical malpractice', short: 'Med mal', cat: 'professional', w: 2, liab: { clear: 0.15, disputed: 0.45, weak: 0.4 }, limits: 'medmal', sol: 730, sevW: [3, 15, 32, 32, 18], costMult: 2.5, expertRequired: true, presuitNotice: true, desc: 'Missed diagnosis or surgical error. Expert affidavit required to even file. Expensive, slow, high-stakes.' },
    product: { name: 'Defective product', short: 'Product liability', cat: 'professional', w: 1, liab: { clear: 0.3, disputed: 0.45, weak: 0.25 }, limits: 'commercial', sol: 730, sevW: [8, 22, 35, 23, 12], costMult: 2.0, expertRequired: true, desc: 'Exploding battery, failed airbag, collapsing ladder. Engineering experts and a corporate defendant.' },
    nursing_home: { name: 'Nursing home neglect', short: 'Nursing home', cat: 'professional', w: 2, liab: { clear: 0.4, disputed: 0.4, weak: 0.2 }, limits: 'cgl', sol: 730, sevW: [8, 22, 32, 24, 14], costMult: 1.6, desc: 'Bedsores, falls and dehydration. Arbitration clauses buried in admission paperwork.' },
    wrongful_death: { name: 'Wrongful death', short: 'Wrongful death', cat: 'auto', w: 1, liab: { clear: 0.55, disputed: 0.35, weak: 0.1 }, limits: 'auto', sol: 730, sevW: [0, 0, 0, 0, 100], costMult: 1.4, death: true, desc: 'A family lost someone. Survivors\' claims, estate claims, and a probate court to coordinate.' },
    government: { name: 'Government vehicle crash', short: 'Government', cat: 'auto', w: 2, liab: { clear: 0.6, disputed: 0.3, weak: 0.1 }, limits: 'government', sol: 730, noticeDays: 180, sevW: [35, 37, 18, 8, 2], costMult: 1.1, desc: 'City bus or county truck. Notice of claim due in 180 days or the case is gone. Damages capped.' }
  };

  // Injury severity tiers.
  D.SEVERITY = [
    null,
    { name: 'Minor soft tissue', specials: [3000, 14000], mult: [1.4, 2.4], weeks: [6, 16], wage: [0, 2500], surgeryChance: 0, examples: ['cervical strain', 'lumbar sprain', 'contusions', 'whiplash'] },
    { name: 'Moderate', specials: [12000, 48000], mult: [1.8, 3.0], weeks: [12, 30], wage: [1000, 9000], surgeryChance: 0.1, examples: ['herniated disc L4-L5', 'concussion', 'fractured wrist', 'torn meniscus', 'facial lacerations'] },
    { name: 'Serious', specials: [40000, 120000], mult: [2.2, 3.2], weeks: [26, 60], wage: [8000, 45000], surgeryChance: 0.6, examples: ['lumbar fusion candidate', 'ORIF femur fracture', 'rotator cuff tear requiring repair', 'mild traumatic brain injury', 'multiple rib fractures with pneumothorax'] },
    { name: 'Severe', specials: [120000, 400000], mult: [2.5, 3.5], weeks: [40, 100], wage: [30000, 180000], surgeryChance: 0.9, examples: ['incomplete spinal cord injury', 'severe TBI with cognitive deficits', 'below-knee amputation', 'third-degree burns over 20% of body', 'crush injury with permanent loss of function'] },
    { name: 'Catastrophic', specials: [300000, 1200000], mult: [3.0, 4.5], weeks: [60, 140], wage: [100000, 900000], surgeryChance: 1.0, examples: ['paraplegia', 'quadriplegia', 'severe anoxic brain injury', 'death of a 38-year-old parent of three', 'death of a retired grandparent'] }
  ];

  // Treatment providers. costPerWeek is billed charges. lop: likely to treat on a letter of protection.
  D.PROVIDERS = {
    er: { name: 'Emergency room', cost: [1800, 9000], once: true, lien: 'hospital' },
    urgent: { name: 'Urgent care', cost: [350, 900], once: true },
    pcp: { name: 'Primary care physician', cost: [180, 350], once: true },
    chiro: { name: 'Chiropractor', perWeek: [220, 420], lop: true, software: -0.1 },
    pt: { name: 'Physical therapy', perWeek: [260, 520], lop: true },
    ortho: { name: 'Orthopedic surgeon', cost: [450, 900], once: true, lop: true },
    mri: { name: 'MRI imaging', cost: [1800, 3600], once: true, lop: true },
    pain: { name: 'Pain management (injections)', cost: [3500, 9000], once: true, lop: true },
    neuro: { name: 'Neurologist', cost: [900, 2200], once: true, lop: true },
    surgery: { name: 'Surgery', cost: [45000, 180000], once: true, lop: true, lien: 'hospital' },
    psych: { name: 'Psychologist (PTSD)', perWeek: [180, 300], lop: false },
    rehab: { name: 'Inpatient rehabilitation', cost: [60000, 250000], once: true, lien: 'hospital' },
    lifecare: { name: 'Long-term care', perWeek: [800, 2000], once: false }
  };

  // Staff roles. capacity: weekly work points. skills listed are the ones that matter for the role.
  D.ROLES = {
    attorney: { name: 'Associate attorney', plural: 'Attorneys', salary: [85000, 165000], capacity: 14, skills: ['negotiation', 'litigation', 'client'], desc: 'Carries a caseload, negotiates, litigates. The only role that can own a case.' },
    trial: { name: 'Trial attorney', plural: 'Trial attorneys', salary: [180000, 320000], capacity: 12, skills: ['litigation', 'negotiation', 'client'], desc: 'Stands up in front of juries. Expensive. Turns litigation files into verdicts.' },
    paralegal: { name: 'Paralegal', plural: 'Paralegals', salary: [48000, 78000], capacity: 8, skills: ['organization'], desc: 'Records requests, demand packages, discovery responses. Doubles an attorney\'s throughput.' },
    casemgr: { name: 'Case manager', plural: 'Case managers', salary: [44000, 68000], capacity: 8, skills: ['client'], desc: 'Keeps clients treating and informed. Fewer gaps, fewer firings, more referrals.' },
    intake: { name: 'Intake specialist', plural: 'Intake specialists', salary: [40000, 60000], capacity: 8, skills: ['intake'], desc: 'Answers the phone at 2 a.m. and signs the case before the TV firm does.' },
    investigator: { name: 'Investigator', plural: 'Investigators', salary: [52000, 85000], capacity: 6, skills: ['investigation'], desc: 'Finds the witness, pulls the video, photographs the pothole. Builds liability.' },
    lien: { name: 'Lien negotiator', plural: 'Lien negotiators', salary: [50000, 75000], capacity: 8, skills: ['negotiation'], desc: 'Fights health plans, Medicare and hospitals over reimbursement. Every dollar cut goes to the client.' },
    marketing: { name: 'Marketing director', plural: 'Marketing directors', salary: [90000, 160000], capacity: 0, skills: ['marketing'], desc: 'Squeezes more leads out of every ad dollar and keeps the brand consistent.' },
    office: { name: 'Office manager', plural: 'Office managers', salary: [45000, 70000], capacity: 0, skills: ['management'], desc: 'Payroll, vendors, trust accounting hygiene. Keeps morale up and the bar auditor happy.' },
    cfo: { name: 'Finance director', plural: 'Finance directors', salary: [120000, 200000], capacity: 0, skills: ['management'], desc: 'Cheaper credit, cleaner books, lower overhead. Required for firms with real money.' }
  };

  // Office tiers.
  D.OFFICES = [
    { id: 0, name: 'Home office', rent: 0, cap: 2, rep: 0, desc: 'A spare bedroom, a printer and a P.O. box. Clients meet you at the coffee shop.' },
    { id: 1, name: 'Shared executive suite', rent: 1800, cap: 4, rep: 2, desc: 'A rented office, a shared receptionist and a conference room you book by the hour.' },
    { id: 2, name: 'Small office', rent: 5500, cap: 10, rep: 5, desc: 'Your name on a door in a professional building. Room for a real team.' },
    { id: 3, name: 'Full floor', rent: 16000, cap: 25, rep: 9, desc: 'A full floor with a mock courtroom, a war room and a sign in the lobby.' },
    { id: 4, name: 'Own building', rent: 42000, cap: 60, rep: 14, desc: 'A converted bank building downtown. Billboards point at it.' },
    { id: 5, name: 'Named tower', rent: 150000, cap: 200, rep: 22, desc: 'Your name in forty-foot letters on a tower. Jurors see it from the courthouse steps.' }
  ];

  // Marketing channels. cost is monthly per level. leads per month per level at level 1 (diminishing).
  D.CHANNELS = {
    referral: { name: 'Past-client referrals', cost: 0, leads: 0, quality: 1.3, maxLevel: 0, passive: true, desc: 'Happy clients send their cousins. The best leads in the business and the only free ones.' },
    network: { name: 'Attorney referral network', cost: 600, leads: 1.0, quality: 1.25, maxLevel: 5, fee: 0.25, desc: 'Lunches and CLE talks with divorce and criminal lawyers who do not want PI cases. You pay a 25% referral fee on the attorney fee.' },
    seo: { name: 'Website and SEO', cost: 1500, leads: 1.4, quality: 1.0, maxLevel: 5, ramp: 26, desc: 'Content, reviews, directory listings. Slow to build, cheap to keep.' },
    ppc: { name: 'Search ads', cost: 3000, leads: 2.2, quality: 0.9, maxLevel: 6, desc: 'You pay per click, up to $300 a click for "truck accident lawyer". Fast, expensive, instant.' },
    social: { name: 'Social media video', cost: 2000, leads: 1.6, quality: 0.8, maxLevel: 5, desc: 'Short videos explaining what to do after a crash. Reaches younger clients. Lots of junk calls.' },
    billboard: { name: 'Billboards', cost: 6000, leads: 2.6, quality: 0.85, maxLevel: 6, rep: 1, desc: 'Your face, a phone number and a promise. Nothing says PI lawyer like the interstate.' },
    radio: { name: 'Radio', cost: 9000, leads: 4.0, quality: 0.85, maxLevel: 5, rep: 1, unlockTier: 2, desc: 'Drive-time spots. Everyone stuck in traffic is a future client.' },
    tv: { name: 'Television', cost: 30000, leads: 14, quality: 0.75, maxLevel: 6, rep: 3, unlockTier: 3, desc: 'Daytime and late-night spots. Volume, brand recognition and a flood of low-value calls.' },
    sponsorship: { name: 'Community sponsorship', cost: 3500, leads: 0.8, quality: 1.15, maxLevel: 4, rep: 2, desc: 'Little League jerseys, charity 5Ks, scholarship funds. Slow leads, real reputation.' },
    medical: { name: 'Medical provider relationships', cost: 1200, leads: 1.2, quality: 1.05, maxLevel: 4, risk: true, desc: 'Lunches with chiropractors and urgent-care owners. Walks a fine ethical line. Carriers notice.' }
  };

  // Firm progression. Conditions evaluated against firm stats.
  D.TIERS = [
    { id: 0, name: 'Solo practitioner', req: {}, desc: 'One lawyer, one phone, one chance.' },
    { id: 1, name: 'Boutique firm', req: { staff: 3, fees: 250000, resolved: 10 }, unlocks: ['Radio advertising', 'Line of credit increase'], desc: 'A real team and a real book of cases.' },
    { id: 2, name: 'Established firm', req: { staff: 8, fees: 1500000, resolved: 60, office: 2 }, unlocks: ['Television advertising', 'Second office'], desc: 'Adjusters know your name. So do the referral lawyers.' },
    { id: 3, name: 'Regional powerhouse', req: { staff: 20, fees: 8000000, resolved: 250, trials: 3, offices: 2 }, unlocks: ['Mass tort participation', 'Litigation funding'], desc: 'Multiple offices, trial verdicts in the paper, defense firms adding you to their conflict lists.' },
    { id: 4, name: 'Statewide brand', req: { staff: 45, fees: 40000000, resolved: 1000, offices: 3, verdict: 1000000 }, unlocks: ['Named tower', 'Succession planning'], desc: 'Your jingle is stuck in a million heads. Carriers reserve differently when they see your letterhead.' },
    { id: 5, name: 'National dynasty', req: { staff: 90, fees: 150000000, resolved: 3000, offices: 5, verdict: 10000000, successor: true }, unlocks: ['Legacy'], desc: 'Offices across the map, a successor named, and a name that will outlive you.' }
  ];

  D.LIEN_TYPES = {
    health: { name: 'Health insurance subrogation', reducible: [0.2, 0.5], desc: 'The health plan paid the bills and wants it back. Procurement-cost and made-whole arguments can cut it.' },
    erisa: { name: 'ERISA self-funded plan', reducible: [0.0, 0.2], desc: 'Self-funded employer plan. Federal law lets it refuse almost every reduction argument.' },
    medicare: { name: 'Medicare conditional payment', reducible: [0.1, 0.35], desc: 'Medicare must be repaid before the client sees a dime. Statutory formula reduction for procurement costs.' },
    medicaid: { name: 'Medicaid', reducible: [0.2, 0.6], desc: 'State program. Capped to the medical portion of recovery.' },
    hospital: { name: 'Hospital lien', reducible: [0.3, 0.6], desc: 'Filed against the recovery for billed charges. Usually inflated far above what insurers pay.' },
    lop: { name: 'Letter of protection (provider)', reducible: [0.3, 0.55], desc: 'Provider treated on your promise to pay from settlement. Negotiable, and they expect the call.' },
    comp: { name: 'Workers\' compensation lien', reducible: [0.1, 0.4], desc: 'The comp carrier paid wages and medical and has a statutory lien on third-party recoveries.' },
    medpay: { name: 'Med-pay reimbursement', reducible: [0.4, 1.0], desc: 'Client\'s own auto policy paid bills. Many carriers waive it if asked.' },
    childsupport: { name: 'Child support arrears', reducible: [0, 0], desc: 'State intercepts settlements for arrears. Not negotiable.' }
  };

  D.LIT_STAGES = [
    { id: 'filing', name: 'Complaint filed', weeks: [1, 2], cost: 450, work: 3 },
    { id: 'service', name: 'Service of process', weeks: [2, 6], cost: 120, work: 1 },
    { id: 'answer', name: 'Answer and scheduling order', weeks: [3, 6], cost: 0, work: 1 },
    { id: 'discovery', name: 'Written discovery', weeks: [8, 14], cost: 300, work: 3 },
    { id: 'depositions', name: 'Depositions', weeks: [4, 10], cost: 0, work: 4 },
    { id: 'experts', name: 'Expert disclosures', weeks: [4, 8], cost: 0, work: 3 },
    { id: 'motions', name: 'Motion practice', weeks: [3, 6], cost: 200, work: 3 },
    { id: 'mediation', name: 'Mediation', weeks: [2, 4], cost: 1750, work: 3 },
    { id: 'pretrial', name: 'Pretrial and trial setting', weeks: [6, 30], cost: 2500, work: 3 },
    { id: 'trial', name: 'Trial', weeks: [1, 2], cost: 6000, work: 10 },
    { id: 'posttrial', name: 'Post-trial motions and collection', weeks: [4, 10], cost: 500, work: 2 },
    { id: 'appeal', name: 'Appeal', weeks: [40, 80], cost: 12000, work: 3 }
  ];

  D.EXPERTS = {
    recon: { name: 'Accident reconstructionist', cost: 8500, liability: 0.12, cats: ['auto'] },
    medical: { name: 'Medical causation expert', cost: 12000, damages: 0.15, cats: ['auto', 'premises', 'professional'] },
    econ: { name: 'Economist (lost earnings)', cost: 6000, damages: 0.1, minSev: 3 },
    lifecare: { name: 'Life care planner', cost: 16000, damages: 0.2, minSev: 4 },
    premises: { name: 'Premises safety expert', cost: 7500, liability: 0.15, cats: ['premises'] },
    trucking: { name: 'Motor carrier safety expert', cost: 11000, liability: 0.15, types: ['trucking'] },
    medmal: { name: 'Standard-of-care physician', cost: 25000, liability: 0.25, required: true, types: ['medmal', 'nursing_home'] },
    engineer: { name: 'Product design engineer', cost: 22000, liability: 0.22, required: true, types: ['product'] },
    biomech: { name: 'Biomechanical engineer', cost: 9500, damages: 0.08, cats: ['auto'] },
    jury: { name: 'Jury consultant', cost: 18000, trial: 0.06 }
  };

  D.RED_FLAGS = [
    { id: 'prior_claims', name: 'Prior injury claims', desc: 'Client has filed three claims in five years. Carriers index this.', valueMult: 0.85, credibility: -0.1, w: 10 },
    { id: 'preexisting', name: 'Pre-existing condition', desc: 'Degenerative disc disease on a 2019 MRI. Expect an "eggshell" fight.', valueMult: 0.8, w: 18 },
    { id: 'gap', name: 'Delayed treatment', desc: 'Client waited 19 days to see a doctor. Software valuation will punish it.', valueMult: 0.85, w: 14 },
    { id: 'no_insurance', name: 'Defendant may be uninsured', desc: 'No carrier listed on the exchange of information. Check the client\'s UM coverage.', uninsured: 0.6, w: 8 },
    { id: 'difficult', name: 'Difficult client', desc: 'Already fired one lawyer. Calls daily. Expects a million dollars.', moodDecay: 2, w: 10 },
    { id: 'social', name: 'Social media problem', desc: 'Posted gym selfies two days after the crash.', credibility: -0.15, w: 8 },
    { id: 'minor_damage', name: 'Minimal property damage', desc: 'Bumper scuff. Adjusters will argue no one could be hurt.', valueMult: 0.8, w: 14 },
    { id: 'language', name: 'Language barrier', desc: 'Client speaks only Portuguese. Need interpreters at every step.', work: 1.2, w: 6 },
    { id: 'immigration', name: 'Immigration concerns', desc: 'Client fears court appearances. Litigation will be hard.', litPenalty: 0.1, w: 5 },
    { id: 'comp', name: 'On the job', desc: 'Client was working at the time. Workers\' comp lien will attach.', compLien: true, w: 8 },
    { id: 'child', name: 'Minor child claimant', desc: 'Court approval of any settlement required. Slower disbursement.', extraWeeks: 6, w: 5 }
  ];

  D.GREEN_FLAGS = [
    { id: 'dashcam', name: 'Dash-cam footage', desc: 'Client\'s own camera caught the whole thing.', liability: 0.25, w: 10 },
    { id: 'witness', name: 'Independent witness', desc: 'A nurse in the next lane saw it and stopped.', liability: 0.15, w: 16 },
    { id: 'citation', name: 'Defendant cited', desc: 'Police cited the other driver at the scene.', liability: 0.15, w: 20 },
    { id: 'commercial', name: 'Commercial defendant', desc: 'The other vehicle has a logo on the door. Bigger policy.', commercial: true, w: 8 },
    { id: 'sympathetic', name: 'Sympathetic client', desc: 'Schoolteacher, two kids, coaches soccer on weekends. Juries love them.', credibility: 0.15, w: 12 },
    { id: 'high_earner', name: 'High earner', desc: 'Surgeon who cannot operate. Wage loss is the case.', wageMult: 3, w: 5 },
    { id: 'umbrella', name: 'Umbrella policy', desc: 'Defendant lives in the nice part of town. Personal umbrella likely.', umbrella: true, w: 6 },
    { id: 'admitted', name: 'Admission at the scene', desc: '"I\'m so sorry, I was texting." Recorded by a bystander.', liability: 0.2, w: 10 }
  ];

  D.JUDGES = ['Hon. Marcus Ellery', 'Hon. Dolores Finch', 'Hon. Raymond Castellanos', 'Hon. Priya Venkataraman', 'Hon. Theodore Blankenship', 'Hon. Wanda Okoye', 'Hon. Gerald Stroud', 'Hon. Lucia Marchetti', 'Hon. Amos Kettering', 'Hon. Beverly Nakashima'];
  D.DEFENSE_FIRMS = ['Hartwell & Voss LLP', 'Carrington Defense Group', 'Pell, Markham & Stone', 'Ridgeway Insurance Defense', 'Bauer Oliphant', 'Castle Rock Litigation', 'Whitfield Burke'];
  D.MEDIATORS = ['Judge (ret.) Alan Pruitt', 'Judge (ret.) Simone Delacroix', 'Harold Weiss, Esq.', 'Patricia Ng, Esq.', 'Judge (ret.) Victor Salazar'];

  D.INJURY_NARRATIVES = {
    rearend: ['stopped at a red light on {road} when a {vehicle} struck them from behind', 'slowing for traffic on the interstate when rear-ended by a {vehicle}', 'waiting to turn left when hit from behind by a {vehicle} at about 35 mph'],
    intersection: ['proceeding through the intersection of {road} and Fifth when a {vehicle} ran the light', 'turning left on a green arrow when a {vehicle} ran the red', 'crossing {road} when a {vehicle} failed to yield'],
    dui: ['driving home on {road} when a {vehicle} crossed the center line; the driver was arrested for DUI', 'stopped at a light on {road} when struck by a {vehicle} driven by an intoxicated driver'],
    motorcycle: ['riding on {road} when a {vehicle} turned left across their path', 'riding in the right lane when a {vehicle} changed lanes without looking'],
    pedestrian: ['crossing {road} in a marked crosswalk when struck by a {vehicle}', 'walking along the shoulder of {road} when struck by a {vehicle}'],
    rideshare: ['a back-seat passenger in a rideshare vehicle on {road} when the driver ran a stop sign', 'a rideshare passenger when another {vehicle} ran a red light and T-boned the car'],
    trucking: ['driving on the interstate when a tractor-trailer changed lanes into their vehicle', 'stopped in construction traffic when a tractor-trailer failed to brake', 'struck by a dump truck making a wide right turn on {road}'],
    premises: ['walking through the produce section at {business} when they slipped on a liquid spill with no warning cone', 'descending an unlit stairwell at {business} with a loose handrail', 'tripped on a raised sidewalk slab outside {business}'],
    dogbite: ['bitten by a neighbor\'s unleashed German shepherd while walking on {road}', 'delivering a package when the homeowner\'s pit bull came through an open gate'],
    negligent_security: ['assaulted in the parking lot of {business}, where the gates had been broken for months', 'robbed and beaten in a stairwell at {business} with no working lights or cameras'],
    workplace_third: ['working for a subcontractor at {business}\'s job site when scaffolding erected by another sub collapsed', 'struck by a load dropped from a crane operated by a different contractor'],
    medmal: ['sent home from {business} with "anxiety" during a heart attack', 'operated on at {business}, where the surgeon left a retained sponge', 'given a tenfold overdose of medication at {business}'],
    product: ['using a ladder from {business} when a rung sheared off', 'injured when a lithium battery pack sold by {business} ignited', 'driving when the airbag deployed with metal fragments'],
    nursing_home: ['a resident at {business} who developed stage IV pressure ulcers', 'a resident at {business} who fell three times in a month with no care plan changes', 'a resident at {business} found severely dehydrated'],
    wrongful_death: ['killed when a {vehicle} crossed the center line on {road}', 'killed in a collision with a tractor-trailer on the interstate', 'killed in a crosswalk on {road}'],
    government: ['struck by a city bus making a left turn on {road}', 'rear-ended by a county public works truck on {road}']
  };
  D.ROADS = ['Harbor Boulevard', 'Route 9', 'Marshall Avenue', 'the Parkway', 'Industrial Drive', 'Old Mill Road', 'Grand Street', 'Ocean Drive', 'Highway 17', 'Lincoln Way'];
  D.VEHICLES = ['pickup truck', 'sedan', 'SUV', 'minivan', 'box truck', 'sports car', 'delivery van', 'work van'];
})();

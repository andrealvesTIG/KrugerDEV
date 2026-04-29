// Capital Projects + extended PPM demo data templates.
// Industry-agnostic seed data used by /api/demo-data/generate to populate
// every Capital Projects sub-module plus the long tail of PPM tables.

export interface DemoAddress {
  addressLine1: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

export const projectAddressPool: DemoAddress[] = [
  { addressLine1: '233 S Wacker Dr', city: 'Chicago', region: 'IL', country: 'USA', postalCode: '60606', latitude: 41.8788, longitude: -87.6359 },
  { addressLine1: '350 Fifth Avenue', city: 'New York', region: 'NY', country: 'USA', postalCode: '10118', latitude: 40.7484, longitude: -73.9857 },
  { addressLine1: '1600 Pennsylvania Ave NW', city: 'Washington', region: 'DC', country: 'USA', postalCode: '20500', latitude: 38.8977, longitude: -77.0365 },
  { addressLine1: '600 Congress Ave', city: 'Austin', region: 'TX', country: 'USA', postalCode: '78701', latitude: 30.2680, longitude: -97.7430 },
  { addressLine1: '1 Dr Carlton B Goodlett Pl', city: 'San Francisco', region: 'CA', country: 'USA', postalCode: '94102', latitude: 37.7793, longitude: -122.4193 },
  { addressLine1: '400 Broad St', city: 'Seattle', region: 'WA', country: 'USA', postalCode: '98109', latitude: 47.6205, longitude: -122.3493 },
  { addressLine1: '1101 California St', city: 'Denver', region: 'CO', country: 'USA', postalCode: '80202', latitude: 39.7440, longitude: -104.9909 },
  { addressLine1: '111 NE 1st St', city: 'Miami', region: 'FL', country: 'USA', postalCode: '33132', latitude: 25.7755, longitude: -80.1916 },
  { addressLine1: '290 Bremner Blvd', city: 'Toronto', region: 'ON', country: 'Canada', postalCode: 'M5V 3L9', latitude: 43.6426, longitude: -79.3871 },
  { addressLine1: '1055 Canada Place', city: 'Vancouver', region: 'BC', country: 'Canada', postalCode: 'V6C 0C3', latitude: 49.2888, longitude: -123.1112 },
];

export const onSiteLocationLabels: string[] = [
  'Level 3 — Northwest Wing',
  'Level 1 — Main Lobby',
  'Mechanical Room B-12',
  'Site Trailer 2',
  'Roof — Section C',
  'Parking Garage P2',
  'Loading Dock',
  'Lobby East Entrance',
  'Tower 2 — Floor 14',
  'Basement — Pump Room',
  'Penthouse Mechanical',
  'Exterior Plaza — North',
  'Stair Core A',
  'Elevator Lobby — Level 5',
  'Electrical Room E-22',
  'Cooling Tower Yard',
  'South Setback — Grade Level',
  'Curtainwall Mockup Bay',
  'Concrete Pour Zone D',
  'Fire Pump Room',
];

export const resourceOfficeLocations: string[] = [
  'Chicago, IL HQ',
  'Remote — PST',
  'Denver Field Office',
  'New York, NY HQ',
  'Austin, TX Office',
  'Toronto, ON Office',
];

export const vendorTemplates = [
  { companyName: 'Apex Mechanical Contractors', contactName: 'Dan Reilly', email: 'dan@apexmech.com', phone: '(312) 555-0142', address: '1820 W Fulton Market', city: 'Chicago', state: 'IL', zipCode: '60612', tradeSpecialty: 'Mechanical / HVAC', licenseNumber: 'IL-MC-44215', bondingCapacity: '5000000', rating: 5, prequalified: true },
  { companyName: 'Summit Electrical Services', contactName: 'Yvette Park', email: 'yvette@summitelec.com', phone: '(212) 555-0188', address: '420 W 33rd Street', city: 'New York', state: 'NY', zipCode: '10001', tradeSpecialty: 'Electrical', licenseNumber: 'NY-EL-90211', bondingCapacity: '7500000', rating: 4, prequalified: true },
  { companyName: 'Cornerstone Concrete Co.', contactName: 'Marcus Vega', email: 'marcus@cornerstoneconc.com', phone: '(303) 555-0166', address: '6240 N Washington St', city: 'Denver', state: 'CO', zipCode: '80216', tradeSpecialty: 'Concrete / Foundations', licenseNumber: 'CO-CN-31108', bondingCapacity: '3000000', rating: 4, prequalified: false },
  { companyName: 'BlueRidge Steel Erectors', contactName: 'Priya Shah', email: 'priya@blueridgesteel.com', phone: '(415) 555-0177', address: '2845 Cesar Chavez St', city: 'San Francisco', state: 'CA', zipCode: '94110', tradeSpecialty: 'Structural Steel', licenseNumber: 'CA-ST-77834', bondingCapacity: '10000000', rating: 5, prequalified: false },
  { companyName: 'Orion Glazing & Curtainwall', contactName: 'Kenji Tanaka', email: 'kenji@orionglazing.com', phone: '(206) 555-0119', address: '3401 Airport Way S', city: 'Seattle', state: 'WA', zipCode: '98134', tradeSpecialty: 'Glazing / Curtainwall', licenseNumber: 'WA-GL-22617', bondingCapacity: '4000000', rating: 4, prequalified: false },
  { companyName: 'Heritage Plumbing & Fire', contactName: 'Anna Walsh', email: 'anna@heritageplumbing.com', phone: '(617) 555-0151', address: '85 Drydock Ave', city: 'Boston', state: 'MA', zipCode: '02210', tradeSpecialty: 'Plumbing / Fire Protection', licenseNumber: 'MA-PL-50992', bondingCapacity: '6000000', rating: 4, prequalified: false },
];

export const skillTemplates = [
  ['Agile', 'Scrum', 'PMP', 'Risk Management', 'Stakeholder Management'],
  ['Requirements', 'BPMN', 'SQL', 'Data Analysis', 'User Stories'],
  ['Architecture', 'Cloud', 'DevOps', 'Python', 'Kubernetes'],
  ['Figma', 'User Research', 'Prototyping', 'CSS', 'Accessibility'],
  ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'GraphQL'],
];

export const dailyLogTemplates = [
  { weather: 'Clear', temp: '72°F', wind: '5 mph SW', precip: '0.00 in', notes: 'Crew on site at 6:30am. Concrete pour on Level 3 completed by lunch. No incidents.', visitors: 'OAC walk: Owner rep, Architect, MEP engineer.' },
  { weather: 'Partly Cloudy', temp: '64°F', wind: '8 mph N', precip: '0.05 in', notes: 'Steel erection continuing on Tower 2. Brief rain delay (~30 min) midmorning.', visitors: 'City inspector — fire-rated assemblies inspection.' },
  { weather: 'Overcast', temp: '58°F', wind: '12 mph NW', precip: '0.10 in', notes: 'Drywall hanging on Levels 4–5. Mechanical rough-in 80% complete on L4.', visitors: 'Insurance inspection.' },
];

export const dailyLogLaborTemplates = [
  { company: 'Apex Mechanical Contractors', trade: 'Mechanical', headcount: 8, hoursWorked: 64 },
  { company: 'Summit Electrical Services', trade: 'Electrical', headcount: 6, hoursWorked: 48 },
  { company: 'Cornerstone Concrete Co.', trade: 'Concrete', headcount: 12, hoursWorked: 96 },
  { company: 'BlueRidge Steel Erectors', trade: 'Structural Steel', headcount: 5, hoursWorked: 40 },
];

export const dailyLogEquipmentTemplates = [
  { equipmentName: 'Tower Crane #1', quantity: 1, hoursUsed: 8, status: 'Active' },
  { equipmentName: 'Concrete Boom Pump', quantity: 1, hoursUsed: 6, status: 'Active' },
  { equipmentName: 'Skid Steer', quantity: 2, hoursUsed: 7, status: 'Active' },
  { equipmentName: 'Welding Generator', quantity: 1, hoursUsed: 8, status: 'Active' },
];

export const rfiTemplates = [
  { subject: 'Spec Clarification — Door Hardware', question: 'Per Spec 087100, can we substitute Schlage L-Series for the specified Sargent 8200 series at corridor doors? Lead-time impact noted.', priority: 'Medium', category: 'Architectural', status: 'Open' },
  { subject: 'Mechanical Coordination — Level 4 Ceiling Plenum', question: 'Conflict between ductwork (M-401) and sprinkler main (FP-401) at column line E-3. Please advise routing priority.', priority: 'High', category: 'Mechanical', status: 'Open' },
  { subject: 'Concrete Mix Design — Slab on Grade', question: 'Confirm acceptance of 4500psi mix with fly-ash substitution at 25% for slab-on-grade pours per Spec 033000.', priority: 'Low', category: 'Structural', status: 'Closed' },
];

export const submittalTemplates = [
  { title: 'Concrete Mix Design — 4500psi', specSection: '033000', type: 'Product Data', status: 'Approved', priority: 'High' },
  { title: 'Curtainwall Shop Drawings — Tower 2', specSection: '084113', type: 'Shop Drawings', status: 'Revise & Resubmit', priority: 'High' },
  { title: 'Fire Sprinkler Hydraulic Calculations', specSection: '211313', type: 'Calculations', status: 'Pending', priority: 'Medium' },
];

export const drawingSetTemplates = [
  { name: 'IFC Set — Issued for Construction', discipline: 'General', description: 'Full IFC issuance covering Architectural, Structural, MEP, and Civil disciplines.' },
];

export const drawingTemplates = [
  { drawingNumber: 'A-101', title: 'Level 1 — Floor Plan', discipline: 'Architectural', status: 'Current' },
  { drawingNumber: 'A-201', title: 'Building Elevations — North & South', discipline: 'Architectural', status: 'Current' },
  { drawingNumber: 'S-301', title: 'Foundation Plan — Tower 2', discipline: 'Structural', status: 'Current' },
  { drawingNumber: 'M-401', title: 'Level 4 — Mechanical Ductwork', discipline: 'Mechanical', status: 'Superseded' },
  { drawingNumber: 'E-501', title: 'Level 5 — Lighting Plan', discipline: 'Electrical', status: 'Current' },
];

export const punchItemTemplates = [
  { title: 'Touch-up paint at corridor jambs', description: 'Multiple jambs scuffed during HM door installation.', category: 'Architectural', priority: 'Low', status: 'Open' },
  { title: 'Replace damaged ceiling tile', description: '2x2 tile at grid C-7 cracked during MEP coordination.', category: 'Architectural', priority: 'Low', status: 'In Progress' },
  { title: 'Trim breaker panel labeling', description: 'Panel L4-A breaker labels missing for circuits 21–24.', category: 'Electrical', priority: 'Medium', status: 'Open' },
  { title: 'Adjust VAV box airflow', description: 'TAB report flags low CFM at VAV-405; confirm and rebalance.', category: 'Mechanical', priority: 'Medium', status: 'Open' },
  { title: 'Caulk perimeter window sill', description: 'Sealant missing at exterior sill — east elevation.', category: 'Exterior', priority: 'Medium', status: 'Closed' },
];

export const inspectionTemplateData = {
  template: { name: 'Pre-Pour Concrete Inspection', description: 'Standard pre-pour QC checklist for slab-on-grade and elevated decks.', category: 'Quality' },
  items: [
    { section: 'Formwork', itemText: 'Forms aligned, plumb, and adequately braced', itemType: 'pass_fail' },
    { section: 'Reinforcement', itemText: 'Rebar placement matches drawings (size, spacing, cover)', itemType: 'pass_fail' },
    { section: 'Reinforcement', itemText: 'Lap splices meet specification length', itemType: 'pass_fail' },
    { section: 'Embeds', itemText: 'Anchor bolts and embeds installed per shop drawings', itemType: 'pass_fail' },
    { section: 'MEP', itemText: 'Sleeves and conduit penetrations marked and protected', itemType: 'pass_fail' },
    { section: 'Site', itemText: 'Pour zone clean and free of debris', itemType: 'pass_fail' },
  ],
};

export const inspectionInstanceTemplates = [
  { title: 'Foundation Inspection — Tower 2', inspectionType: 'Quality', status: 'Completed', overallResult: 'Pass' },
  { title: 'Slab on Grade — North Wing', inspectionType: 'Quality', status: 'In Progress', overallResult: null },
];

export const incidentTemplates = [
  {
    title: 'Minor hand laceration during steel erection',
    description: 'Ironworker sustained a minor hand laceration while handling a connector plate. First aid administered on site.',
    category: 'Injury', severity: 'Minor', status: 'Under Investigation',
    rootCause: 'Improper glove selection for cut-resistance.',
    immediateActions: 'First aid administered. Toolbox talk scheduled. PPE inventory audit initiated.',
    actions: [
      { actionType: 'Corrective', description: 'Issue ANSI A4 cut-resistant gloves to all steel erectors.', status: 'In Progress' },
      { actionType: 'Preventive', description: 'Add cut-resistance verification to weekly toolbox talks.', status: 'Open' },
    ],
  },
];

export const observationTemplates = [
  {
    title: 'Unsecured lanyard tie-off observed',
    description: 'Observed worker tied off to a horizontal pipe rather than designated anchor point on Level 4.',
    category: 'Safety', observationType: 'Negative', severity: 'Medium', status: 'Open',
    correctiveAction: 'Re-train crew on approved tie-off points; install additional anchorage.',
    actions: [
      { actionType: 'Corrective', description: 'Conduct fall-protection refresher with affected crew.', status: 'Open' },
    ],
  },
  {
    title: 'Excellent housekeeping in mechanical room',
    description: 'Mechanical contractor maintaining outstanding housekeeping standards.',
    category: 'Quality', observationType: 'Positive', severity: 'Low', status: 'Closed',
    correctiveAction: null,
    actions: [],
  },
];

export const changeOrderTemplates = [
  {
    changeOrderNumber: 'CO-001', title: 'Owner-requested upgrade to lobby flooring', description: 'Upgrade from VCT to terrazzo throughout Level 1 lobby.',
    tier: 'PCO', status: 'Approved', reasonCode: 'Owner Request', costImpact: 85000, scheduleImpactDays: 5,
    lines: [
      { costCode: '09-66-00', description: 'Demo existing VCT — Level 1 lobby', quantity: 1, unitPrice: 4500, totalPrice: 4500, category: 'Demolition' },
      { costCode: '09-66-13', description: 'Furnish & install terrazzo flooring — 2,400 SF', quantity: 2400, unitPrice: 32, totalPrice: 76800, category: 'Finishes' },
      { costCode: '01-00-00', description: 'GC general conditions / supervision', quantity: 1, unitPrice: 3700, totalPrice: 3700, category: 'General Conditions' },
    ],
  },
  {
    changeOrderNumber: 'CO-002', title: 'Unforeseen subgrade rock — Tower 2 footings', description: 'Rock encountered at Tower 2 spread footings requiring rock excavation.',
    tier: 'CO', status: 'Pending', reasonCode: 'Differing Site Condition', costImpact: 42000, scheduleImpactDays: 3,
    lines: [
      { costCode: '31-23-16', description: 'Rock excavation — 180 CY', quantity: 180, unitPrice: 210, totalPrice: 37800, category: 'Earthwork' },
      { costCode: '01-00-00', description: 'Equipment standby — boom truck', quantity: 8, unitPrice: 525, totalPrice: 4200, category: 'General Conditions' },
    ],
  },
];

export const constructionInvoiceTemplates = [
  {
    invoiceNumber: 'PA-001', title: 'Pay Application #1 — Apex Mechanical', description: 'Mechanical work in place through period close.',
    contractAmount: 1850000, totalAmount: 185000, previousBilled: 0, currentBilled: 185000, balanceToFinish: 1665000, retainage: 18500, status: 'Approved',
    vendorName: 'Apex Mechanical Contractors',
    lines: [
      { costCode: '23-21-13', description: 'Hydronic piping — Level 1', scheduledValue: 450000, previousBilled: 0, currentBilled: 60000, balanceToFinish: 390000, percentComplete: 13 },
      { costCode: '23-31-13', description: 'Ductwork — Levels 1–3', scheduledValue: 720000, previousBilled: 0, currentBilled: 95000, balanceToFinish: 625000, percentComplete: 13 },
      { costCode: '23-09-23', description: 'BAS rough-in', scheduledValue: 180000, previousBilled: 0, currentBilled: 30000, balanceToFinish: 150000, percentComplete: 17 },
    ],
  },
  {
    invoiceNumber: 'PA-002', title: 'Pay Application #2 — Summit Electrical', description: 'Electrical work in place through period close.',
    contractAmount: 1350000, totalAmount: 162000, previousBilled: 50000, currentBilled: 112000, balanceToFinish: 1188000, retainage: 16200, status: 'Submitted',
    vendorName: 'Summit Electrical Services',
    lines: [
      { costCode: '26-05-19', description: 'Branch wiring — Levels 1–2', scheduledValue: 380000, previousBilled: 20000, currentBilled: 40000, balanceToFinish: 320000, percentComplete: 16 },
      { costCode: '26-24-13', description: 'Switchgear installation', scheduledValue: 420000, previousBilled: 30000, currentBilled: 50000, balanceToFinish: 340000, percentComplete: 19 },
      { costCode: '26-51-13', description: 'Lighting fixtures — Level 1', scheduledValue: 210000, previousBilled: 0, currentBilled: 22000, balanceToFinish: 188000, percentComplete: 10 },
    ],
  },
];

export const meetingTemplates = [
  {
    title: 'Owner / Architect / Contractor Weekly', meetingType: 'OAC', status: 'Held',
    minutesNotes: 'Reviewed open RFIs (3 outstanding). Schedule slipping ~3 days due to weather. Mitigation plan agreed.',
    agenda: [
      { title: 'Safety moment', presenter: 'Site Superintendent', duration: 5 },
      { title: 'Schedule update', presenter: 'Project Manager', duration: 15 },
      { title: 'RFI status review', presenter: 'Architect', duration: 20 },
      { title: 'Open issues', presenter: 'GC', duration: 15 },
    ],
    actions: [
      { title: 'Issue revised look-ahead schedule', assignee: 'Project Manager', status: 'Open', priority: 'High' },
      { title: 'Resolve RFI 002 routing conflict', assignee: 'MEP Engineer', status: 'Open', priority: 'High' },
    ],
    minutesContent: 'Detailed minutes captured during the meeting. Distributed via email to all attendees.',
  },
  {
    title: 'Subcontractor Coordination — MEP', meetingType: 'Coordination', status: 'Held',
    minutesNotes: 'Trade-coordinated routing for L4 ceiling plenum confirmed. Sequence agreed.',
    agenda: [
      { title: 'BIM clash review — Level 4', presenter: 'BIM Coordinator', duration: 30 },
      { title: 'Two-week look-ahead', presenter: 'GC Superintendent', duration: 15 },
    ],
    actions: [
      { title: 'Update Revit model with revised ductwork', assignee: 'BIM Coordinator', status: 'In Progress', priority: 'Medium' },
    ],
    minutesContent: 'Coordination minutes — revised routing distributed to mechanical, electrical, plumbing, and fire-protection trades.',
  },
];

export const correspondenceTemplates = [
  { type: 'Letter', subject: 'Notice to Proceed — Tower 2', body: 'Owner hereby grants Notice to Proceed for Tower 2 site work effective immediately.', fromName: 'Owner Representative', toName: 'General Contractor', priority: 'Normal', status: 'Sent' },
  { type: 'Email', subject: 'Schedule update — Week of Sept 15', body: 'Please find attached the updated three-week look-ahead schedule.', fromName: 'Project Manager', toName: 'OAC Distribution', priority: 'Normal', status: 'Sent' },
  { type: 'Letter', subject: 'Substantial Completion Punch List Issued', body: 'Architect has issued the substantial completion punch list. Please review and acknowledge.', fromName: 'Architect', toName: 'General Contractor', priority: 'High', status: 'Sent' },
  { type: 'Email', subject: 'Insurance certificate renewal', body: 'Renewed COI attached. Effective dates inside.', fromName: 'Risk Manager', toName: 'Owner Representative', priority: 'Low', status: 'Draft' },
];

export const bidPackageTemplates = [
  {
    number: 'BP-23-00', title: 'Bid Package — Mechanical', tradeCategory: 'Mechanical', status: 'Awarded',
    scope: 'Furnish and install all mechanical systems including HVAC, hydronic piping, BAS rough-in.',
    estimatedBudget: 1850000,
    lines: [
      { description: 'Mobilization', unit: 'LS', quantity: 1, unitPrice: 45000, totalPrice: 45000, category: 'General Conditions' },
      { description: 'Hydronic piping', unit: 'LF', quantity: 4500, unitPrice: 95, totalPrice: 427500, category: 'Piping' },
      { description: 'Ductwork', unit: 'LB', quantity: 85000, unitPrice: 8.5, totalPrice: 722500, category: 'Sheet Metal' },
      { description: 'BAS rough-in', unit: 'LS', quantity: 1, unitPrice: 180000, totalPrice: 180000, category: 'Controls' },
    ],
  },
  {
    number: 'BP-26-00', title: 'Bid Package — Electrical', tradeCategory: 'Electrical', status: 'Bidding',
    scope: 'All electrical work including service entrance, distribution, branch wiring, lighting, low-voltage.',
    estimatedBudget: 1350000,
    lines: [
      { description: 'Service entrance & switchgear', unit: 'LS', quantity: 1, unitPrice: 380000, totalPrice: 380000, category: 'Distribution' },
      { description: 'Branch wiring', unit: 'LF', quantity: 24000, unitPrice: 14, totalPrice: 336000, category: 'Wiring' },
      { description: 'Lighting fixtures (allowance)', unit: 'LS', quantity: 1, unitPrice: 420000, totalPrice: 420000, category: 'Lighting' },
      { description: 'Low-voltage rough-in', unit: 'LS', quantity: 1, unitPrice: 180000, totalPrice: 180000, category: 'LV Systems' },
    ],
  },
];

export const costItemTemplates = [
  { name: 'Internal Labor — Engineering', financialView: 'Labor', costCategory: 'Internal Labor', costSpecification: 'Engineering', category: 'Labor', wbs: '01.01' },
  { name: 'Internal Labor — Project Management', financialView: 'Labor', costCategory: 'Internal Labor', costSpecification: 'PM', category: 'Labor', wbs: '01.02' },
  { name: 'Hardware', financialView: 'Capital', costCategory: 'Capital Equipment', costSpecification: 'Hardware', category: 'Equipment', wbs: '02.01' },
  { name: 'Software Licenses', financialView: 'Capital', costCategory: 'Capital Software', costSpecification: 'Licenses', category: 'Software', wbs: '02.02' },
  { name: 'Outside Services — Consulting', financialView: 'Direct Expense', costCategory: 'Outside Services', costSpecification: 'Consulting', category: 'Services', wbs: '03.01' },
  { name: 'Travel & Meals', financialView: 'Direct Expense', costCategory: 'Travel', costSpecification: 'Travel/Meals', category: 'Travel', wbs: '03.02' },
  { name: 'Project Materials', financialView: 'Direct Expense', costCategory: 'Materials', costSpecification: 'General Materials', category: 'Materials', wbs: '03.03' },
];

export const projectCommentTemplates = [
  { content: 'Reviewed the latest schedule update — looking good. Any concerns about the upcoming mechanical inspection?', authorName: 'Demo PM' },
  { content: 'Budget tracking on plan through this period. Will flag if forecast moves more than 5%.', authorName: 'Demo Controller' },
  { content: 'Great work team — health back to Green this week.', authorName: 'Demo Sponsor' },
];

export type Industry = 'it_software' | 'healthcare' | 'finance' | 'retail' | 'manufacturing';

export interface DemoDataTemplate {
  industry: Industry;
  label: string;
  description: string;
  scoringCriteria?: Array<{
    name: string;
    description: string;
    category: string;
    weight: number;
    maxScore: number;
  }>;
  portfolios: Array<{
    name: string;
    description: string;
    projects: Array<{
      name: string;
      description: string;
      status: string;
      priority: string;
      budget: string;
      health: string;
      completionPercentage: number;
      tasks: Array<{
        name: string;
        description: string;
        progress: number;
        status: string;
        assignee: string;
      }>;
      risks: Array<{
        title: string;
        description: string;
        probability: string;
        impact: string;
        status: string;
        mitigationPlan: string;
        costExposure?: string;
      }>;
      milestones: Array<{
        title: string;
        description: string;
        dueDaysFromNow: number;
        completed: boolean;
        status: string;
        priority: string;
        assignee: string;
      }>;
      issues: Array<{
        title: string;
        description: string;
        priority: string;
        status: string;
        type: string;
        assignee: string;
        costExposure?: string;
      }>;
      financials: Array<{
        category: string;
        lineItem: string;
        description: string;
        budgetAmount: string;
        plannedAmount: string;
        actualAmount: string;
        notes: string;
      }>;
      lessonsLearned?: Array<{
        title: string;
        description: string;
        category: string;
        type: string;
        impact: string;
        phase: string;
        recommendation: string;
        status: string;
      }>;
      changeRequests?: Array<{
        title: string;
        description: string;
        justification: string;
        type: string;
        priority: string;
        status: string;
        impact: string;
        estimatedCost: number;
        estimatedEffort: string;
      }>;
      documents?: Array<{
        title: string;
        description: string;
        type: string;
        category: string;
        version: string;
        status: string;
        fileName: string;
        content?: string;
      }>;
      benefits?: Array<{
        name: string;
        description: string;
        category: string;
        benefitType: string;
        status: string;
        targetValue: string;
        actualValue?: string;
        measurementMethod: string;
      }>;
      decisions?: Array<{
        title: string;
        description: string;
        status: string;
        priority: string;
        decisionType: string;
        outcome?: string;
        rationale?: string;
        alternatives?: string;
      }>;
    }>;
  }>;
}

export const industryTemplates: Record<Industry, DemoDataTemplate> = {
  it_software: {
    industry: 'it_software',
    label: 'IT / Software Development',
    description: 'Cloud, AI, security, and digital transformation projects',
    portfolios: [
      {
        name: 'Digital Transformation',
        description: 'Cloud migration, AI adoption, and data modernization initiatives',
        projects: [
          {
            name: 'Cloud Migration Phase 2',
            description: 'Migrating remaining on-premise workloads to cloud infrastructure',
            status: 'Execution',
            priority: 'Critical',
            budget: '1200000',
            health: 'Yellow',
            completionPercentage: 35,
            tasks: [
              { name: 'VM Assessment and Inventory', description: 'Complete inventory of remaining on-premise VMs', progress: 100, status: 'Completed', assignee: 'Michael Chen' },
              { name: 'Network Architecture Design', description: 'Design hybrid network connectivity', progress: 80, status: 'In Progress', assignee: 'Sarah Johnson' },
              { name: 'Database Migration Planning', description: 'Plan migration strategy for SQL Server databases', progress: 60, status: 'In Progress', assignee: 'David Kim' },
            ],
            risks: [
              { title: 'Data Loss During Migration', description: 'Risk of data corruption or loss during database migration', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Implement comprehensive backup strategy and rollback procedures', costExposure: '75000' },
              { title: 'Application Downtime', description: 'Extended downtime during cutover may impact business', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Schedule migrations during off-peak hours, use blue-green deployment', costExposure: '120000' },
            ],
            milestones: [
              { title: 'Infrastructure Assessment Complete', description: 'All VMs inventoried and prioritized', dueDaysFromNow: -30, completed: true, status: 'Done', priority: 'High', assignee: 'Michael Chen' },
              { title: 'Network Connectivity Established', description: 'Hybrid connectivity operational', dueDaysFromNow: 60, completed: false, status: 'In Progress', priority: 'Critical', assignee: 'Sarah Johnson' },
            ],
            issues: [
              { title: 'Azure connectivity timeout issues', description: 'Intermittent timeouts when connecting to cloud resources', priority: 'High', status: 'Open', type: 'Bug', assignee: 'Sarah Johnson', costExposure: '15000' },
              { title: 'Legacy app compatibility assessment', description: 'Several legacy applications need compatibility review', priority: 'Medium', status: 'Open', type: 'Task', assignee: 'Emily Rodriguez', costExposure: '35000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Cloud Infrastructure', description: 'Cloud VMs, storage, and networking costs', budgetAmount: '450000', plannedAmount: '420000', actualAmount: '185000', notes: 'On track with quarterly spend' },
              { category: 'OpEx', lineItem: 'Cloud Consulting', description: 'Partner consulting services', budgetAmount: '280000', plannedAmount: '250000', actualAmount: '120000', notes: 'Phase 1 consulting complete' },
            ],
            lessonsLearned: [
              { title: 'Early Vendor Engagement', description: 'Engaging cloud vendors early helped identify compatibility issues before migration started', category: 'Process', type: 'Success', impact: 'High', phase: 'Planning', recommendation: 'Include vendor technical reviews in all future migration projects', status: 'Active' },
              { title: 'Insufficient Testing Time', description: 'Performance testing was rushed due to timeline pressures, leading to post-migration issues', category: 'Technical', type: 'Improvement', impact: 'Medium', phase: 'Execution', recommendation: 'Allocate minimum 3 weeks for load testing in migration timelines', status: 'Active' },
            ],
            changeRequests: [
              { title: 'Extended Migration Window', description: 'Request to extend migration cutover window from 8 hours to 12 hours', justification: 'Database size larger than initially estimated, requires additional time for data sync', type: 'Schedule', priority: 'High', status: 'Approved', impact: 'Minimal business impact during weekend window', estimatedCost: 15000, estimatedEffort: '4 hours additional' },
              { title: 'Add Disaster Recovery Region', description: 'Add secondary DR region for critical workloads', justification: 'Compliance requirement discovered during security review', type: 'Scope', priority: 'Critical', status: 'Under Review', impact: 'Improves RTO/RPO but increases cloud costs', estimatedCost: 85000, estimatedEffort: '3 weeks' },
            ],
            documents: [
              { title: 'Cloud Migration Runbook', description: 'Step-by-step procedures for VM migration and cutover', type: 'Document', category: 'Technical', version: '2.1', status: 'Approved', fileName: 'migration-runbook-v2.1.pdf', content: 'This runbook contains detailed procedures for migrating virtual machines to cloud infrastructure including pre-migration checks, cutover steps, and rollback procedures.' },
              { title: 'Architecture Decision Record', description: 'ADR documenting hybrid connectivity design decisions', type: 'Design', category: 'Architecture', version: '1.0', status: 'Approved', fileName: 'adr-hybrid-connectivity.md', content: 'ADR-001: Hybrid Network Connectivity\n\nContext: Need secure, reliable connectivity between on-premise and cloud.\n\nDecision: Implement ExpressRoute with VPN backup.\n\nConsequences: Higher cost but improved reliability and security.' },
            ],
            benefits: [
              { name: 'Infrastructure Cost Reduction', description: 'Reduce annual infrastructure costs by consolidating on-premise servers', category: 'Financial', benefitType: 'Tangible', status: 'Tracking', targetValue: '320000', measurementMethod: 'Compare annual cloud spend vs baseline on-prem costs' },
              { name: 'Improved Scalability', description: 'Enable elastic scaling for peak demand periods', category: 'Operational', benefitType: 'Tangible', status: 'Tracking', targetValue: '100', measurementMethod: 'Load testing metrics and production scaling events' },
              { name: 'Reduced Downtime', description: 'Improve system availability through cloud redundancy', category: 'Operational', benefitType: 'Tangible', status: 'Planned', targetValue: '99.9', measurementMethod: 'Monthly availability reports from monitoring system' },
            ],
            decisions: [
              { title: 'Multi-Cloud Strategy', description: 'Decide on single cloud vs multi-cloud approach for migration', status: 'Made', priority: 'Critical', decisionType: 'Strategic', outcome: 'Single cloud (Azure) with DR in secondary region', rationale: 'Multi-cloud adds complexity without proportional benefits for our use case. Azure offers best integration with existing Microsoft stack.', alternatives: 'AWS primary, GCP primary, Multi-cloud (Azure + AWS)' },
              { title: 'Database Migration Approach', description: 'Choose between lift-and-shift vs refactor for database migration', status: 'Made', priority: 'High', decisionType: 'Technical', outcome: 'Lift-and-shift with post-migration optimization', rationale: 'Faster migration timeline, can optimize after cutover without blocking other workloads', alternatives: 'Full refactor to managed DB services, Hybrid approach' },
              { title: 'Network Connectivity Model', description: 'Select VPN vs ExpressRoute vs Direct Connect', status: 'Pending', priority: 'High', decisionType: 'Technical', alternatives: 'Site-to-Site VPN, ExpressRoute, ExpressRoute + VPN backup' },
            ],
          },
          {
            name: 'AI-Powered Document Processing',
            description: 'Implementing intelligent document extraction and classification',
            status: 'Planning',
            priority: 'High',
            budget: '450000',
            health: 'Green',
            completionPercentage: 10,
            tasks: [
              { name: 'POC Environment Setup', description: 'Set up development environment for AI services', progress: 100, status: 'Completed', assignee: 'AI Team' },
              { name: 'Training Data Collection', description: 'Gather and label sample documents', progress: 40, status: 'In Progress', assignee: 'Data Science Team' },
            ],
            risks: [
              { title: 'AI Model Accuracy', description: 'Classification model may not meet accuracy requirements', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Extensive training data collection, human-in-the-loop validation', costExposure: '45000' },
            ],
            milestones: [
              { title: 'POC Demonstration', description: 'Demonstrate working prototype to stakeholders', dueDaysFromNow: 45, completed: false, status: 'In Progress', priority: 'High', assignee: 'AI Team Lead' },
            ],
            issues: [
              { title: 'OCR accuracy below target for handwritten docs', description: 'OCR showing 72% accuracy vs 85% target', priority: 'High', status: 'Open', type: 'Bug', assignee: 'AI Team', costExposure: '25000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'AI Services', description: 'AI platform and cognitive services', budgetAmount: '120000', plannedAmount: '100000', actualAmount: '15000', notes: 'POC environment setup' },
              { category: 'OpEx', lineItem: 'Data Labeling', description: 'Training data preparation and labeling', budgetAmount: '85000', plannedAmount: '75000', actualAmount: '8000', notes: 'Labeling team onboarding' },
            ],
          },
        ],
      },
      {
        name: 'Security & Compliance',
        description: 'Cybersecurity improvements and regulatory compliance programs',
        projects: [
          {
            name: 'Zero Trust Implementation',
            description: 'Deploying zero-trust security architecture across all systems',
            status: 'Execution',
            priority: 'Critical',
            budget: '650000',
            health: 'Green',
            completionPercentage: 55,
            tasks: [
              { name: 'Identity Provider Integration', description: 'Integrate central identity provider', progress: 100, status: 'Completed', assignee: 'Alex Thompson' },
              { name: 'Conditional Access Policies', description: 'Implement conditional access for all applications', progress: 85, status: 'In Progress', assignee: 'Jennifer Wu' },
              { name: 'Network Segmentation', description: 'Deploy micro-segmentation across all zones', progress: 40, status: 'In Progress', assignee: 'Robert Taylor' },
            ],
            risks: [
              { title: 'User Adoption Resistance', description: 'Employees may resist new authentication requirements', probability: 'High', impact: 'Medium', status: 'Open', mitigationPlan: 'Comprehensive training program, phased rollout with pilot groups', costExposure: '200000' },
            ],
            milestones: [
              { title: 'Phase 1: Identity Go-Live', description: 'Identity integration complete for all users', dueDaysFromNow: -45, completed: true, status: 'Done', priority: 'Critical', assignee: 'Alex Thompson' },
              { title: 'Phase 2: Application Access', description: 'All applications protected with conditional access', dueDaysFromNow: 90, completed: false, status: 'In Progress', priority: 'High', assignee: 'Jennifer Wu' },
            ],
            issues: [
              { title: 'MFA enrollment incomplete for contractors', description: 'Some contractor accounts missing MFA enrollment', priority: 'High', status: 'In Progress', type: 'Bug', assignee: 'Alex Thompson', costExposure: '50000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Security Tools', description: 'Identity and security platform licenses', budgetAmount: '320000', plannedAmount: '320000', actualAmount: '290000', notes: 'Annual licenses renewed' },
              { category: 'OpEx', lineItem: 'Security Consulting', description: 'Zero trust architecture consulting', budgetAmount: '180000', plannedAmount: '160000', actualAmount: '95000', notes: 'Phase 2 in progress' },
            ],
          },
        ],
      },
    ],
  },
  healthcare: {
    industry: 'healthcare',
    label: 'Healthcare',
    description: 'Patient care, clinical systems, and compliance projects',
    portfolios: [
      {
        name: 'Patient Experience',
        description: 'Digital patient engagement and care coordination initiatives',
        projects: [
          {
            name: 'Patient Portal Modernization',
            description: 'Redesigning patient portal with enhanced self-service capabilities',
            status: 'Execution',
            priority: 'High',
            budget: '850000',
            health: 'Green',
            completionPercentage: 40,
            tasks: [
              { name: 'Patient Journey Mapping', description: 'Map current patient digital touchpoints', progress: 100, status: 'Completed', assignee: 'UX Research Team' },
              { name: 'Portal UI/UX Redesign', description: 'Create new patient-centric interface designs', progress: 75, status: 'In Progress', assignee: 'Design Team' },
              { name: 'Integration with EHR', description: 'Connect new portal with Epic EHR system', progress: 30, status: 'In Progress', assignee: 'Integration Team' },
            ],
            risks: [
              { title: 'HIPAA Compliance Gap', description: 'New features may introduce compliance risks', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Engage compliance team for design review, conduct security assessment', costExposure: '85000' },
              { title: 'EHR Integration Delays', description: 'Epic integration more complex than estimated', probability: 'High', impact: 'Medium', status: 'Open', mitigationPlan: 'Engage Epic professional services, allocate buffer time', costExposure: '60000' },
            ],
            milestones: [
              { title: 'Design Approval', description: 'Stakeholder approval of new portal designs', dueDaysFromNow: 30, completed: false, status: 'In Progress', priority: 'High', assignee: 'Product Manager' },
              { title: 'Beta Launch', description: 'Limited release to pilot patient group', dueDaysFromNow: 120, completed: false, status: 'Backlog', priority: 'Critical', assignee: 'Project Manager' },
            ],
            issues: [
              { title: 'Accessibility audit findings', description: 'WCAG 2.1 AA compliance gaps identified', priority: 'High', status: 'Open', type: 'Bug', assignee: 'Frontend Team', costExposure: '18000' },
              { title: 'Mobile responsive issues on tablets', description: 'Layout breaks on iPad Pro landscape mode', priority: 'Medium', status: 'Open', type: 'Bug', assignee: 'Design Team', costExposure: '42000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Development Platform', description: 'Cloud infrastructure and development tools', budgetAmount: '200000', plannedAmount: '180000', actualAmount: '95000', notes: 'Environment provisioned' },
              { category: 'OpEx', lineItem: 'UX Agency', description: 'External UX design and research', budgetAmount: '250000', plannedAmount: '230000', actualAmount: '120000', notes: 'Phase 1 research complete' },
            ],
            lessonsLearned: [
              { title: 'Patient Feedback Integration', description: 'Incorporating real patient feedback early in design improved acceptance rates', category: 'Process', type: 'Success', impact: 'High', phase: 'Planning', recommendation: 'Include patient advisory councils in all patient-facing projects', status: 'Active' },
              { title: 'HIPAA Review Timing', description: 'HIPAA compliance review should happen earlier to avoid design rework', category: 'Compliance', type: 'Improvement', impact: 'Medium', phase: 'Planning', recommendation: 'Engage compliance team in sprint zero for all healthcare projects', status: 'Active' },
            ],
            changeRequests: [
              { title: 'Add Prescription Refill Feature', description: 'Allow patients to request prescription refills through the portal', justification: 'High patient demand identified in user research, reduces call center volume', type: 'Scope', priority: 'High', status: 'Approved', impact: 'Adds 3 weeks to timeline, reduces support costs by 20%', estimatedCost: 45000, estimatedEffort: '3 weeks' },
            ],
            documents: [
              { title: 'HIPAA Compliance Assessment', description: 'Security and privacy assessment for patient portal features', type: 'Compliance', category: 'Security', version: '1.2', status: 'Approved', fileName: 'hipaa-assessment-v1.2.pdf', content: 'This assessment evaluates the patient portal for HIPAA compliance including PHI handling, access controls, audit logging, and data encryption at rest and in transit.' },
              { title: 'Patient Journey Map', description: 'Visual map of patient digital touchpoints and pain points', type: 'Design', category: 'UX', version: '2.0', status: 'Approved', fileName: 'patient-journey-map.pdf', content: 'Comprehensive journey map showing patient interactions across appointment scheduling, check-in, portal access, test results viewing, and medication management.' },
            ],
            benefits: [
              { name: 'Patient Satisfaction Improvement', description: 'Increase patient satisfaction scores through improved digital experience', category: 'Strategic', benefitType: 'Intangible', status: 'Tracking', targetValue: '65', measurementMethod: 'Quarterly patient satisfaction surveys' },
              { name: 'Call Center Volume Reduction', description: 'Reduce call center volume through self-service capabilities', category: 'Financial', benefitType: 'Tangible', status: 'Tracking', targetValue: '30', measurementMethod: 'Monthly call center analytics comparing to baseline' },
              { name: 'Improved Appointment Adherence', description: 'Reduce no-show rates with automated reminders', category: 'Operational', benefitType: 'Tangible', status: 'Planned', targetValue: '8', measurementMethod: 'Monthly no-show reports from scheduling system' },
            ],
            decisions: [
              { title: 'EHR Integration Approach', description: 'Choose between real-time vs batch data sync with Epic EHR', status: 'Made', priority: 'Critical', decisionType: 'Technical', outcome: 'Real-time HL7 FHIR integration', rationale: 'Patients expect real-time access to test results and appointment data. Batch processing would create unacceptable delays.', alternatives: 'Nightly batch sync, Hybrid real-time for critical data' },
              { title: 'Mobile App vs Responsive Web', description: 'Decide on native mobile app vs responsive web for patient portal', status: 'Made', priority: 'High', decisionType: 'Strategic', outcome: 'Progressive Web App (PWA) with push notifications', rationale: 'PWA provides app-like experience without app store approval delays and works across all devices', alternatives: 'Native iOS/Android apps, Responsive web only' },
            ],
          },
          {
            name: 'Telehealth Platform Expansion',
            description: 'Expanding virtual care capabilities with specialist consultations',
            status: 'Planning',
            priority: 'Critical',
            budget: '1200000',
            health: 'Yellow',
            completionPercentage: 15,
            tasks: [
              { name: 'Vendor Evaluation', description: 'Evaluate telehealth platform vendors', progress: 100, status: 'Completed', assignee: 'Procurement Team' },
              { name: 'Clinical Workflow Design', description: 'Design virtual care clinical workflows', progress: 50, status: 'In Progress', assignee: 'Clinical Informatics' },
            ],
            risks: [
              { title: 'State Licensing Requirements', description: 'Varying state licensing for telehealth practitioners', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Engage legal team for state-by-state compliance review', costExposure: '350000' },
            ],
            milestones: [
              { title: 'Vendor Selection', description: 'Final telehealth platform vendor selected', dueDaysFromNow: -15, completed: true, status: 'Done', priority: 'High', assignee: 'IT Director' },
              { title: 'Pilot Program Launch', description: 'Launch pilot with primary care department', dueDaysFromNow: 90, completed: false, status: 'In Progress', priority: 'Critical', assignee: 'Program Manager' },
            ],
            issues: [
              { title: 'Video quality issues on mobile', description: 'Poor video quality reported on older mobile devices', priority: 'Medium', status: 'Open', type: 'Bug', assignee: 'Vendor Support', costExposure: '8000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Telehealth Platform', description: 'Platform licensing and implementation', budgetAmount: '600000', plannedAmount: '550000', actualAmount: '125000', notes: 'Initial license purchased' },
              { category: 'OpEx', lineItem: 'Training', description: 'Clinical staff training program', budgetAmount: '150000', plannedAmount: '150000', actualAmount: '25000', notes: 'Train-the-trainer started' },
            ],
          },
        ],
      },
      {
        name: 'Clinical Operations',
        description: 'Operational efficiency and clinical system improvements',
        projects: [
          {
            name: 'OR Scheduling Optimization',
            description: 'AI-powered operating room scheduling to maximize utilization',
            status: 'Execution',
            priority: 'High',
            budget: '400000',
            health: 'Green',
            completionPercentage: 60,
            tasks: [
              { name: 'Historical Data Analysis', description: 'Analyze 3 years of OR utilization data', progress: 100, status: 'Completed', assignee: 'Analytics Team' },
              { name: 'ML Model Development', description: 'Build predictive scheduling model', progress: 70, status: 'In Progress', assignee: 'Data Science Team' },
              { name: 'Integration with Scheduling System', description: 'Connect model to existing scheduling software', progress: 20, status: 'In Progress', assignee: 'Integration Team' },
            ],
            risks: [
              { title: 'Surgeon Adoption', description: 'Surgeons may resist AI-suggested scheduling', probability: 'High', impact: 'Medium', status: 'Open', mitigationPlan: 'Involve surgical champions early, demonstrate time savings', costExposure: '55000' },
            ],
            milestones: [
              { title: 'Model Validation Complete', description: 'ML model validated against historical data', dueDaysFromNow: 30, completed: false, status: 'In Progress', priority: 'High', assignee: 'Data Science Lead' },
            ],
            issues: [
              { title: 'Data quality issues in legacy system', description: 'Missing procedure duration data for 15% of cases', priority: 'High', status: 'In Progress', type: 'Task', assignee: 'Analytics Team', costExposure: '65000' },
            ],
            financials: [
              { category: 'OpEx', lineItem: 'Data Science Consulting', description: 'External ML expertise', budgetAmount: '180000', plannedAmount: '180000', actualAmount: '110000', notes: 'Phase 2 in progress' },
              { category: 'CapEx', lineItem: 'Infrastructure', description: 'ML training infrastructure', budgetAmount: '80000', plannedAmount: '75000', actualAmount: '60000', notes: 'GPU cluster provisioned' },
            ],
          },
        ],
      },
    ],
  },
  finance: {
    industry: 'finance',
    label: 'Financial Services',
    description: 'Banking, trading, and regulatory compliance projects',
    portfolios: [
      {
        name: 'Digital Banking',
        description: 'Customer-facing digital banking transformation',
        projects: [
          {
            name: 'Mobile Banking App Redesign',
            description: 'Next-generation mobile banking experience with personalized insights',
            status: 'Execution',
            priority: 'Critical',
            budget: '2500000',
            health: 'Yellow',
            completionPercentage: 45,
            tasks: [
              { name: 'Customer Research', description: 'Conduct user research and journey mapping', progress: 100, status: 'Completed', assignee: 'UX Research' },
              { name: 'Design System Update', description: 'Create new design system components', progress: 80, status: 'In Progress', assignee: 'Design Team' },
              { name: 'Core Banking Integration', description: 'Connect to core banking APIs', progress: 40, status: 'In Progress', assignee: 'Backend Team' },
              { name: 'Security Hardening', description: 'Implement advanced security controls', progress: 25, status: 'In Progress', assignee: 'Security Team' },
            ],
            risks: [
              { title: 'Core Banking API Latency', description: 'Legacy core banking APIs too slow for mobile UX', probability: 'High', impact: 'High', status: 'Open', mitigationPlan: 'Implement caching layer, optimize API calls', costExposure: '90000' },
              { title: 'App Store Rejection', description: 'New features may violate app store guidelines', probability: 'Low', impact: 'High', status: 'Open', mitigationPlan: 'Early submission to TestFlight/Play Beta', costExposure: '180000' },
            ],
            milestones: [
              { title: 'Design Freeze', description: 'Final design approved for development', dueDaysFromNow: -20, completed: true, status: 'Done', priority: 'High', assignee: 'Product Owner' },
              { title: 'Internal Beta', description: 'Employee beta testing phase', dueDaysFromNow: 60, completed: false, status: 'In Progress', priority: 'High', assignee: 'QA Lead' },
              { title: 'Public Launch', description: 'App store release', dueDaysFromNow: 120, completed: false, status: 'Backlog', priority: 'Critical', assignee: 'Release Manager' },
            ],
            issues: [
              { title: 'Face ID authentication failing on iOS 17', description: 'Biometric auth not working after iOS update', priority: 'Critical', status: 'In Progress', type: 'Bug', assignee: 'iOS Team', costExposure: '22000' },
              { title: 'Transaction history slow to load', description: '5+ second load times for large transaction lists', priority: 'High', status: 'Open', type: 'Bug', assignee: 'Backend Team', costExposure: '30000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Development Platform', description: 'Mobile development infrastructure', budgetAmount: '400000', plannedAmount: '380000', actualAmount: '250000', notes: 'CI/CD pipeline complete' },
              { category: 'OpEx', lineItem: 'UX Agency', description: 'External design agency', budgetAmount: '600000', plannedAmount: '580000', actualAmount: '420000', notes: 'Design phase complete' },
              { category: 'OpEx', lineItem: 'Security Assessment', description: 'Third-party penetration testing', budgetAmount: '150000', plannedAmount: '150000', actualAmount: '45000', notes: 'Initial assessment done' },
            ],
            lessonsLearned: [
              { title: 'Biometric Auth Complexity', description: 'Underestimated complexity of biometric authentication across device types', category: 'Technical', type: 'Improvement', impact: 'High', phase: 'Execution', recommendation: 'Include device fragmentation testing in all mobile project estimates', status: 'Active' },
              { title: 'Core Banking API Wrapper', description: 'Creating abstraction layer for legacy APIs improved development velocity', category: 'Technical', type: 'Success', impact: 'High', phase: 'Execution', recommendation: 'Invest in API abstraction layer before major integrations', status: 'Active' },
            ],
            changeRequests: [
              { title: 'Add Biometric Login for Transactions', description: 'Require biometric confirmation for transactions over $1,000', justification: 'New regulatory requirement and customer feedback on security', type: 'Scope', priority: 'Critical', status: 'Approved', impact: 'Enhanced security posture, minor UX friction', estimatedCost: 75000, estimatedEffort: '2 weeks' },
              { title: 'Defer Crypto Portfolio Feature', description: 'Remove cryptocurrency portfolio viewing from initial release', justification: 'Regulatory uncertainty requires additional legal review', type: 'Scope', priority: 'Medium', status: 'Approved', impact: 'Reduces scope and risk, can add in v1.1', estimatedCost: -50000, estimatedEffort: '-2 weeks' },
            ],
            documents: [
              { title: 'Security Architecture Document', description: 'Technical security architecture for mobile banking application', type: 'Architecture', category: 'Security', version: '3.0', status: 'Approved', fileName: 'security-architecture-v3.pdf', content: 'This document outlines the security architecture including certificate pinning, secure enclave usage, jailbreak detection, transaction signing, and session management.' },
              { title: 'PCI-DSS Compliance Checklist', description: 'Payment card industry compliance requirements mapping', type: 'Compliance', category: 'Regulatory', version: '1.0', status: 'Draft', fileName: 'pci-dss-checklist.xlsx', content: 'Checklist mapping PCI-DSS requirements to application controls including cardholder data protection, access control, and encryption standards.' },
            ],
          },
          {
            name: 'Open Banking API Platform',
            description: 'PSD2 compliant open banking API infrastructure',
            status: 'Execution',
            priority: 'High',
            budget: '1800000',
            health: 'Green',
            completionPercentage: 70,
            tasks: [
              { name: 'API Gateway Implementation', description: 'Deploy enterprise API gateway', progress: 100, status: 'Completed', assignee: 'Platform Team' },
              { name: 'TPP Onboarding Portal', description: 'Build third-party provider onboarding', progress: 85, status: 'In Progress', assignee: 'Portal Team' },
              { name: 'Consent Management', description: 'Implement customer consent framework', progress: 60, status: 'In Progress', assignee: 'Identity Team' },
            ],
            risks: [
              { title: 'Regulatory Non-Compliance', description: 'APIs may not fully meet PSD2 RTS requirements', probability: 'Medium', impact: 'Critical', status: 'Open', mitigationPlan: 'Engage regulatory consultant for compliance review', costExposure: '40000' },
            ],
            milestones: [
              { title: 'API Gateway Live', description: 'Production API gateway deployed', dueDaysFromNow: -60, completed: true, status: 'Done', priority: 'Critical', assignee: 'Platform Lead' },
              { title: 'First TPP Integration', description: 'First third-party successfully integrated', dueDaysFromNow: 45, completed: false, status: 'In Progress', priority: 'High', assignee: 'Integration Lead' },
            ],
            issues: [
              { title: 'Rate limiting too aggressive', description: 'TPPs hitting rate limits during normal usage', priority: 'High', status: 'Open', type: 'Bug', assignee: 'Platform Team', costExposure: '12000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'API Platform', description: 'API management platform licenses', budgetAmount: '800000', plannedAmount: '780000', actualAmount: '720000', notes: '3-year license agreement' },
              { category: 'OpEx', lineItem: 'Regulatory Consulting', description: 'PSD2 compliance expertise', budgetAmount: '250000', plannedAmount: '250000', actualAmount: '180000', notes: 'Ongoing engagement' },
            ],
          },
        ],
      },
      {
        name: 'Risk & Compliance',
        description: 'Regulatory compliance and risk management initiatives',
        projects: [
          {
            name: 'AML System Upgrade',
            description: 'Upgrading anti-money laundering detection with ML capabilities',
            status: 'Planning',
            priority: 'Critical',
            budget: '3500000',
            health: 'Yellow',
            completionPercentage: 20,
            tasks: [
              { name: 'Current State Assessment', description: 'Document existing AML processes and gaps', progress: 100, status: 'Completed', assignee: 'Compliance Team' },
              { name: 'Vendor Selection', description: 'Evaluate and select AML platform vendor', progress: 60, status: 'In Progress', assignee: 'Procurement' },
            ],
            risks: [
              { title: 'False Positive Increase', description: 'New ML models may generate more false positives initially', probability: 'High', impact: 'Medium', status: 'Open', mitigationPlan: 'Parallel running period, gradual threshold tuning', costExposure: '250000' },
            ],
            milestones: [
              { title: 'Vendor Contract Signed', description: 'AML platform vendor selected and contracted', dueDaysFromNow: 30, completed: false, status: 'In Progress', priority: 'Critical', assignee: 'Procurement Lead' },
            ],
            issues: [
              { title: 'Data migration complexity', description: 'Historical transaction data format incompatible', priority: 'High', status: 'Open', type: 'Task', assignee: 'Data Team', costExposure: '55000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'AML Platform', description: 'Platform licensing and implementation', budgetAmount: '2000000', plannedAmount: '1800000', actualAmount: '200000', notes: 'Initial assessment phase' },
              { category: 'OpEx', lineItem: 'Consulting', description: 'Implementation partner services', budgetAmount: '800000', plannedAmount: '700000', actualAmount: '100000', notes: 'Discovery phase complete' },
            ],
          },
        ],
      },
    ],
  },
  retail: {
    industry: 'retail',
    label: 'Retail / E-Commerce',
    description: 'Online commerce, inventory, and customer experience projects',
    portfolios: [
      {
        name: 'E-Commerce Platform',
        description: 'Digital commerce and customer experience initiatives',
        projects: [
          {
            name: 'Headless Commerce Migration',
            description: 'Migrating to headless commerce architecture for flexibility',
            status: 'Execution',
            priority: 'Critical',
            budget: '1500000',
            health: 'Yellow',
            completionPercentage: 35,
            tasks: [
              { name: 'API Layer Development', description: 'Build commerce API layer', progress: 70, status: 'In Progress', assignee: 'Backend Team' },
              { name: 'Frontend Migration', description: 'Rebuild storefront in Next.js', progress: 40, status: 'In Progress', assignee: 'Frontend Team' },
              { name: 'Product Data Migration', description: 'Migrate product catalog to new PIM', progress: 80, status: 'In Progress', assignee: 'Data Team' },
            ],
            risks: [
              { title: 'SEO Impact', description: 'URL changes may impact search rankings', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Comprehensive redirect mapping, staged rollout', costExposure: '65000' },
              { title: 'Peak Season Deadline', description: 'Must complete before Black Friday', probability: 'High', impact: 'Critical', status: 'Open', mitigationPlan: 'Parallel path: old site as fallback', costExposure: '110000' },
            ],
            milestones: [
              { title: 'API Layer Complete', description: 'All commerce APIs functional', dueDaysFromNow: 45, completed: false, status: 'In Progress', priority: 'Critical', assignee: 'Tech Lead' },
              { title: 'Soft Launch', description: 'Limited traffic to new platform', dueDaysFromNow: 90, completed: false, status: 'Backlog', priority: 'High', assignee: 'Release Manager' },
            ],
            issues: [
              { title: 'Cart abandonment on checkout', description: 'New checkout has 15% higher abandonment rate', priority: 'Critical', status: 'In Progress', type: 'Bug', assignee: 'UX Team', costExposure: '28000' },
              { title: 'Product image loading slow', description: 'Large product images affecting Core Web Vitals', priority: 'High', status: 'Open', type: 'Bug', assignee: 'Frontend Team', costExposure: '38000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Commerce Platform', description: 'Headless commerce platform fees', budgetAmount: '400000', plannedAmount: '400000', actualAmount: '350000', notes: 'Annual subscription paid' },
              { category: 'OpEx', lineItem: 'Implementation Partner', description: 'System integration services', budgetAmount: '600000', plannedAmount: '550000', actualAmount: '280000', notes: 'Phase 1 complete' },
            ],
            lessonsLearned: [
              { title: 'Parallel Path Strategy', description: 'Running old and new platforms in parallel reduced risk significantly', category: 'Strategy', type: 'Success', impact: 'High', phase: 'Execution', recommendation: 'Always maintain fallback during major platform migrations', status: 'Active' },
              { title: 'SEO Redirect Planning', description: 'Starting redirect mapping earlier would have prevented initial SEO drop', category: 'Technical', type: 'Improvement', impact: 'Medium', phase: 'Planning', recommendation: 'Include SEO team in sprint zero for commerce migrations', status: 'Active' },
            ],
            changeRequests: [
              { title: 'Add Apple Pay Support', description: 'Include Apple Pay in checkout options at launch', justification: 'Competitor analysis shows 25% of mobile conversions use Apple Pay', type: 'Scope', priority: 'High', status: 'Approved', impact: 'Improves mobile conversion by estimated 8%', estimatedCost: 35000, estimatedEffort: '2 weeks' },
            ],
            documents: [
              { title: 'Platform Architecture Diagram', description: 'High-level architecture of headless commerce implementation', type: 'Architecture', category: 'Technical', version: '2.0', status: 'Approved', fileName: 'headless-architecture.pdf', content: 'Architecture diagram showing API layer, frontend Next.js application, PIM integration, order management, and payment gateway connections.' },
              { title: 'Performance Benchmark Report', description: 'Core Web Vitals and performance testing results', type: 'Report', category: 'Technical', version: '1.0', status: 'Final', fileName: 'performance-benchmarks.pdf', content: 'Performance benchmark showing LCP, FID, and CLS scores across device types. Current scores: LCP 1.8s, FID 45ms, CLS 0.08.' },
            ],
          },
          {
            name: 'Personalization Engine',
            description: 'AI-driven product recommendations and personalized experiences',
            status: 'Planning',
            priority: 'High',
            budget: '800000',
            health: 'Green',
            completionPercentage: 15,
            tasks: [
              { name: 'Customer Data Platform Setup', description: 'Implement CDP for unified customer profiles', progress: 50, status: 'In Progress', assignee: 'Data Team' },
              { name: 'ML Model POC', description: 'Build recommendation model prototype', progress: 30, status: 'In Progress', assignee: 'Data Science' },
            ],
            risks: [
              { title: 'Privacy Regulation Impact', description: 'New privacy laws may limit personalization', probability: 'Medium', impact: 'Medium', status: 'Open', mitigationPlan: 'Design privacy-first with consent management', costExposure: '30000' },
            ],
            milestones: [
              { title: 'CDP Go-Live', description: 'Customer data platform in production', dueDaysFromNow: 60, completed: false, status: 'In Progress', priority: 'High', assignee: 'Data Lead' },
            ],
            issues: [
              { title: 'Data quality issues in CRM', description: 'Duplicate customer records affecting ML training', priority: 'High', status: 'Open', type: 'Task', assignee: 'Data Team', costExposure: '20000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'CDP Platform', description: 'Customer data platform licensing', budgetAmount: '300000', plannedAmount: '280000', actualAmount: '140000', notes: 'Initial license purchased' },
              { category: 'OpEx', lineItem: 'Data Science Services', description: 'ML model development', budgetAmount: '200000', plannedAmount: '180000', actualAmount: '45000', notes: 'POC phase' },
            ],
          },
        ],
      },
      {
        name: 'Supply Chain',
        description: 'Inventory and logistics optimization',
        projects: [
          {
            name: 'Real-time Inventory System',
            description: 'Unified real-time inventory visibility across all channels',
            status: 'Execution',
            priority: 'High',
            budget: '950000',
            health: 'Green',
            completionPercentage: 55,
            tasks: [
              { name: 'Warehouse Integration', description: 'Connect WMS to central inventory', progress: 90, status: 'In Progress', assignee: 'Integration Team' },
              { name: 'Store POS Integration', description: 'Real-time sync with store systems', progress: 60, status: 'In Progress', assignee: 'Retail IT' },
              { name: 'Inventory Dashboard', description: 'Build operations dashboard', progress: 40, status: 'In Progress', assignee: 'Frontend Team' },
            ],
            risks: [
              { title: 'Store Network Reliability', description: 'Store internet connectivity affects real-time sync', probability: 'Medium', impact: 'Medium', status: 'Open', mitigationPlan: 'Implement offline-first architecture with sync', costExposure: '160000' },
            ],
            milestones: [
              { title: 'Warehouse Integration Complete', description: 'All DCs connected', dueDaysFromNow: 20, completed: false, status: 'In Progress', priority: 'High', assignee: 'Integration Lead' },
              { title: 'Full Store Rollout', description: 'All stores integrated', dueDaysFromNow: 90, completed: false, status: 'Backlog', priority: 'High', assignee: 'Retail IT Lead' },
            ],
            issues: [
              { title: 'Sync latency in high-volume stores', description: 'Inventory updates delayed during peak hours', priority: 'High', status: 'Open', type: 'Bug', assignee: 'Integration Team', costExposure: '45000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Integration Platform', description: 'iPaaS licensing', budgetAmount: '250000', plannedAmount: '240000', actualAmount: '200000', notes: 'Platform deployed' },
              { category: 'OpEx', lineItem: 'Implementation', description: 'Integration development', budgetAmount: '400000', plannedAmount: '380000', actualAmount: '220000', notes: 'Phase 2 in progress' },
            ],
          },
        ],
      },
    ],
  },
  manufacturing: {
    industry: 'manufacturing',
    label: 'Manufacturing',
    description: 'Production, quality, and operational excellence projects',
    portfolios: [
      {
        name: 'Smart Factory',
        description: 'Industry 4.0 and factory digitization initiatives',
        projects: [
          {
            name: 'Predictive Maintenance Platform',
            description: 'IoT-based predictive maintenance for production equipment',
            status: 'Execution',
            priority: 'Critical',
            budget: '1200000',
            health: 'Green',
            completionPercentage: 50,
            tasks: [
              { name: 'IoT Sensor Deployment', description: 'Install sensors on critical equipment', progress: 80, status: 'In Progress', assignee: 'IoT Team' },
              { name: 'Data Lake Setup', description: 'Build industrial data lake for sensor data', progress: 70, status: 'In Progress', assignee: 'Data Engineering' },
              { name: 'ML Model Development', description: 'Build failure prediction models', progress: 40, status: 'In Progress', assignee: 'Data Science' },
            ],
            risks: [
              { title: 'OT/IT Integration Complexity', description: 'Connecting to legacy PLCs more complex than expected', probability: 'High', impact: 'Medium', status: 'Open', mitigationPlan: 'Engage OT integration specialists, use edge gateways', costExposure: '95000' },
              { title: 'False Alarm Fatigue', description: 'Too many false predictions may reduce trust', probability: 'Medium', impact: 'Medium', status: 'Open', mitigationPlan: 'Establish confidence thresholds, gradual rollout', costExposure: '70000' },
            ],
            milestones: [
              { title: 'Sensor Installation Complete', description: 'All priority equipment instrumented', dueDaysFromNow: 30, completed: false, status: 'In Progress', priority: 'High', assignee: 'IoT Lead' },
              { title: 'First Prediction Success', description: 'Successfully predict first equipment failure', dueDaysFromNow: 75, completed: false, status: 'Backlog', priority: 'Critical', assignee: 'Data Science Lead' },
            ],
            issues: [
              { title: 'Sensor connectivity in Plant B', description: 'WiFi coverage insufficient in older facility', priority: 'High', status: 'In Progress', type: 'Bug', assignee: 'Network Team', costExposure: '32000' },
              { title: 'PLC protocol compatibility', description: 'Older Siemens PLCs using proprietary protocol', priority: 'Medium', status: 'Open', type: 'Task', assignee: 'OT Team', costExposure: '48000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'IoT Infrastructure', description: 'Sensors, gateways, and edge devices', budgetAmount: '450000', plannedAmount: '430000', actualAmount: '280000', notes: 'Phase 1 deployed' },
              { category: 'CapEx', lineItem: 'Data Platform', description: 'Industrial IoT platform', budgetAmount: '300000', plannedAmount: '290000', actualAmount: '250000', notes: 'Platform licensed' },
              { category: 'OpEx', lineItem: 'Implementation Services', description: 'System integration and data science', budgetAmount: '350000', plannedAmount: '320000', actualAmount: '180000', notes: 'Phase 2 started' },
            ],
            lessonsLearned: [
              { title: 'Edge Computing Essential', description: 'Processing data at the edge reduced latency from seconds to milliseconds', category: 'Technical', type: 'Success', impact: 'High', phase: 'Execution', recommendation: 'Always include edge gateways in IIoT architecture', status: 'Active' },
              { title: 'OT Team Early Involvement', description: 'Should have involved operations technology team earlier to understand PLC protocols', category: 'Process', type: 'Improvement', impact: 'Medium', phase: 'Planning', recommendation: 'Include OT engineers in discovery phase for all IoT projects', status: 'Active' },
            ],
            changeRequests: [
              { title: 'Add Vibration Sensors to Line 3', description: 'Extend sensor coverage to production line 3', justification: 'Line 3 has highest unplanned downtime and would benefit most from predictions', type: 'Scope', priority: 'High', status: 'Approved', impact: 'Increases coverage to 85% of critical equipment', estimatedCost: 55000, estimatedEffort: '3 weeks' },
            ],
            documents: [
              { title: 'Sensor Placement Diagram', description: 'Equipment sensor placement specifications for all production lines', type: 'Technical', category: 'Engineering', version: '3.0', status: 'Approved', fileName: 'sensor-placement-v3.pdf', content: 'Detailed sensor placement diagrams for CNC machines, conveyors, and robotic cells including vibration, temperature, and current sensors.' },
              { title: 'Data Architecture Document', description: 'Industrial data lake architecture and data flow specifications', type: 'Architecture', category: 'Data', version: '1.0', status: 'Approved', fileName: 'iiot-data-architecture.pdf', content: 'Data architecture showing sensor data ingestion, edge processing, cloud data lake storage, and ML model training pipelines.' },
            ],
          },
          {
            name: 'Digital Twin Implementation',
            description: 'Creating digital twins of production lines for simulation',
            status: 'Planning',
            priority: 'High',
            budget: '900000',
            health: 'Yellow',
            completionPercentage: 20,
            tasks: [
              { name: '3D Model Creation', description: 'Build 3D models of production lines', progress: 50, status: 'In Progress', assignee: 'Engineering' },
              { name: 'Simulation Platform Selection', description: 'Evaluate digital twin platforms', progress: 70, status: 'In Progress', assignee: 'IT Team' },
            ],
            risks: [
              { title: 'Data Accuracy', description: 'Digital twin accuracy depends on real-time data quality', probability: 'Medium', impact: 'High', status: 'Open', mitigationPlan: 'Implement data validation layer, regular calibration', costExposure: '140000' },
            ],
            milestones: [
              { title: 'Platform Selection', description: 'Digital twin platform selected', dueDaysFromNow: 30, completed: false, status: 'In Progress', priority: 'High', assignee: 'IT Director' },
              { title: 'First Line Twin Complete', description: 'Production line 1 digital twin operational', dueDaysFromNow: 120, completed: false, status: 'Backlog', priority: 'High', assignee: 'Project Lead' },
            ],
            issues: [
              { title: 'CAD file format incompatibility', description: 'Legacy CAD files not supported by platform', priority: 'Medium', status: 'Open', type: 'Task', assignee: 'Engineering', costExposure: '16000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Digital Twin Platform', description: 'Platform licensing', budgetAmount: '400000', plannedAmount: '380000', actualAmount: '50000', notes: 'POC license only' },
              { category: 'OpEx', lineItem: 'Consulting', description: 'Implementation partner', budgetAmount: '300000', plannedAmount: '280000', actualAmount: '60000', notes: 'Discovery phase' },
            ],
          },
        ],
      },
      {
        name: 'Quality Excellence',
        description: 'Quality management and continuous improvement',
        projects: [
          {
            name: 'Automated Quality Inspection',
            description: 'Computer vision-based quality inspection system',
            status: 'Execution',
            priority: 'High',
            budget: '650000',
            health: 'Green',
            completionPercentage: 65,
            tasks: [
              { name: 'Camera System Installation', description: 'Install inspection cameras on lines', progress: 100, status: 'Completed', assignee: 'Automation Team' },
              { name: 'CV Model Training', description: 'Train defect detection models', progress: 75, status: 'In Progress', assignee: 'AI Team' },
              { name: 'Integration with MES', description: 'Connect to manufacturing execution system', progress: 40, status: 'In Progress', assignee: 'Integration Team' },
            ],
            risks: [
              { title: 'Lighting Variability', description: 'Different lighting affects detection accuracy', probability: 'Medium', impact: 'Medium', status: 'Mitigated', mitigationPlan: 'Standardized lighting enclosures installed', costExposure: '50000' },
            ],
            milestones: [
              { title: 'Model Training Complete', description: 'CV model achieves 99% accuracy target', dueDaysFromNow: 30, completed: false, status: 'In Progress', priority: 'High', assignee: 'AI Lead' },
              { title: 'Production Deployment', description: 'System operational on all lines', dueDaysFromNow: 75, completed: false, status: 'Backlog', priority: 'Critical', assignee: 'Project Manager' },
            ],
            issues: [
              { title: 'False positives on reflective surfaces', description: 'Shiny parts triggering false defect alerts', priority: 'High', status: 'In Progress', type: 'Bug', assignee: 'AI Team', costExposure: '40000' },
            ],
            financials: [
              { category: 'CapEx', lineItem: 'Vision System', description: 'Cameras and processing hardware', budgetAmount: '300000', plannedAmount: '290000', actualAmount: '275000', notes: 'All hardware installed' },
              { category: 'OpEx', lineItem: 'AI Development', description: 'Model training and integration', budgetAmount: '250000', plannedAmount: '230000', actualAmount: '150000', notes: 'Training ongoing' },
            ],
          },
        ],
      },
    ],
  },
};

// Power Query M Code for Summary/KPI Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/summary",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Extract organizations array
    Organizations = Source[organizations],
    
    // Convert to table
    SummaryTable = Table.FromList(Organizations, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedSummary = Table.ExpandRecordColumn(SummaryTable, "Column1", 
        {"organizationId", "organizationName", "portfolioCount", "projectCount",
         "healthyProjectCount", "atRiskProjectCount", "criticalProjectCount",
         "totalBudget", "avgCompletion", "totalRisks", "openRisks", "highRisks",
         "totalIssues", "openIssues", "totalMilestones", "completedMilestones",
         "totalTasks", "completedTasks", "intakeCount", "pendingIntakes",
         "approvedIntakes", "rejectedIntakes", "timestamp"}),
    
    // Set data types
    TypedSummary = Table.TransformColumnTypes(ExpandedSummary, {
        {"organizationId", Int64.Type},
        {"organizationName", type text},
        {"portfolioCount", Int64.Type},
        {"projectCount", Int64.Type},
        {"healthyProjectCount", Int64.Type},
        {"atRiskProjectCount", Int64.Type},
        {"criticalProjectCount", Int64.Type},
        {"totalBudget", type number},
        {"avgCompletion", type number},
        {"totalRisks", Int64.Type},
        {"openRisks", Int64.Type},
        {"highRisks", Int64.Type},
        {"totalIssues", Int64.Type},
        {"openIssues", Int64.Type},
        {"totalMilestones", Int64.Type},
        {"completedMilestones", Int64.Type},
        {"totalTasks", Int64.Type},
        {"completedTasks", Int64.Type},
        {"intakeCount", Int64.Type},
        {"pendingIntakes", Int64.Type},
        {"approvedIntakes", Int64.Type},
        {"rejectedIntakes", Int64.Type},
        {"timestamp", type datetime}
    }),
    
    // Add calculated columns
    AddMilestoneCompletion = Table.AddColumn(TypedSummary, "MilestoneCompletionPct", each 
        if [totalMilestones] > 0 then [completedMilestones] / [totalMilestones] * 100 else 0,
        type number),
    
    AddTaskCompletion = Table.AddColumn(AddMilestoneCompletion, "TaskCompletionPct", each 
        if [totalTasks] > 0 then [completedTasks] / [totalTasks] * 100 else 0,
        type number),
    
    AddRiskClosureRate = Table.AddColumn(AddTaskCompletion, "RiskClosureRate", each 
        if [totalRisks] > 0 then ([totalRisks] - [openRisks]) / [totalRisks] * 100 else 0,
        type number)
in
    AddRiskClosureRate

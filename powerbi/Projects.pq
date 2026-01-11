// Power Query M Code for Projects Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/projects",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Convert to table
    ProjectsTable = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedProjects = Table.ExpandRecordColumn(ProjectsTable, "Column1", 
        {"id", "name", "status", "health", "description", "startDate", "endDate", 
         "budget", "completionPercentage", "portfolioId", "portfolioName", 
         "organizationId", "organizationName", "riskCount", "openRiskCount", 
         "issueCount", "openIssueCount", "milestoneCount", "completedMilestoneCount",
         "taskCount", "completedTaskCount", "createdAt", "source"}),
    
    // Set data types
    TypedProjects = Table.TransformColumnTypes(ExpandedProjects, {
        {"id", Int64.Type},
        {"name", type text},
        {"status", type text},
        {"health", type text},
        {"description", type text},
        {"startDate", type date},
        {"endDate", type date},
        {"budget", type number},
        {"completionPercentage", Int64.Type},
        {"portfolioId", Int64.Type},
        {"portfolioName", type text},
        {"organizationId", Int64.Type},
        {"organizationName", type text},
        {"riskCount", Int64.Type},
        {"openRiskCount", Int64.Type},
        {"issueCount", Int64.Type},
        {"openIssueCount", Int64.Type},
        {"milestoneCount", Int64.Type},
        {"completedMilestoneCount", Int64.Type},
        {"taskCount", Int64.Type},
        {"completedTaskCount", Int64.Type},
        {"createdAt", type datetime},
        {"source", type text}
    })
in
    TypedProjects

// Power Query M Code for Issues Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/issues",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Convert to table
    IssuesTable = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedIssues = Table.ExpandRecordColumn(IssuesTable, "Column1", 
        {"id", "title", "description", "type", "priority", "status", 
         "projectId", "projectName", "organizationId", "organizationName", 
         "createdAt"}),
    
    // Set data types
    TypedIssues = Table.TransformColumnTypes(ExpandedIssues, {
        {"id", Int64.Type},
        {"title", type text},
        {"description", type text},
        {"type", type text},
        {"priority", type text},
        {"status", type text},
        {"projectId", Int64.Type},
        {"projectName", type text},
        {"organizationId", Int64.Type},
        {"organizationName", type text},
        {"createdAt", type datetime}
    }),
    
    // Add Priority Order for sorting
    AddPriorityOrder = Table.AddColumn(TypedIssues, "PriorityOrder", each 
        if [priority] = "Critical" then 1 
        else if [priority] = "High" then 2 
        else if [priority] = "Medium" then 3 
        else 4,
        Int64.Type)
in
    AddPriorityOrder

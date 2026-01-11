// Power Query M Code for Risks Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/risks",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Convert to table
    RisksTable = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedRisks = Table.ExpandRecordColumn(RisksTable, "Column1", 
        {"id", "title", "description", "probability", "impact", "status", 
         "mitigation", "projectId", "projectName", "organizationId", 
         "organizationName", "createdAt"}),
    
    // Set data types
    TypedRisks = Table.TransformColumnTypes(ExpandedRisks, {
        {"id", Int64.Type},
        {"title", type text},
        {"description", type text},
        {"probability", type text},
        {"impact", type text},
        {"status", type text},
        {"mitigation", type text},
        {"projectId", Int64.Type},
        {"projectName", type text},
        {"organizationId", Int64.Type},
        {"organizationName", type text},
        {"createdAt", type datetime}
    }),
    
    // Add Risk Score column (for analysis)
    AddRiskScore = Table.AddColumn(TypedRisks, "RiskScore", each 
        (if [probability] = "High" then 3 else if [probability] = "Medium" then 2 else 1) *
        (if [impact] = "High" then 3 else if [impact] = "Medium" then 2 else 1),
        Int64.Type)
in
    AddRiskScore

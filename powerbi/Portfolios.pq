// Power Query M Code for Portfolios Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/portfolios",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Convert to table
    PortfoliosTable = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedPortfolios = Table.ExpandRecordColumn(PortfoliosTable, "Column1", 
        {"id", "name", "description", "organizationId", "organizationName", 
         "projectCount", "totalBudget", "healthyCount", "atRiskCount", 
         "criticalCount", "avgCompletion", "createdAt"}),
    
    // Set data types
    TypedPortfolios = Table.TransformColumnTypes(ExpandedPortfolios, {
        {"id", Int64.Type},
        {"name", type text},
        {"description", type text},
        {"organizationId", Int64.Type},
        {"organizationName", type text},
        {"projectCount", Int64.Type},
        {"totalBudget", type number},
        {"healthyCount", Int64.Type},
        {"atRiskCount", Int64.Type},
        {"criticalCount", Int64.Type},
        {"avgCompletion", type number},
        {"createdAt", type datetime}
    })
in
    TypedPortfolios

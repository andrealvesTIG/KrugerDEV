// Power Query M Code for Project Intakes Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/intakes",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Convert to table
    IntakesTable = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedIntakes = Table.ExpandRecordColumn(IntakesTable, "Column1", 
        {"id", "projectName", "description", "status", "currentStep", 
         "businessUnit", "programName", "fundingSource", "estimatedBudget",
         "strategicAlignment", "organizationId", "organizationName", 
         "submitterId", "createdAt"}),
    
    // Set data types
    TypedIntakes = Table.TransformColumnTypes(ExpandedIntakes, {
        {"id", Int64.Type},
        {"projectName", type text},
        {"description", type text},
        {"status", type text},
        {"currentStep", type text},
        {"businessUnit", type text},
        {"programName", type text},
        {"fundingSource", type text},
        {"estimatedBudget", type number},
        {"strategicAlignment", type text},
        {"organizationId", Int64.Type},
        {"organizationName", type text},
        {"submitterId", type text},
        {"createdAt", type datetime}
    }),
    
    // Add status display name
    AddStatusDisplay = Table.AddColumn(TypedIntakes, "StatusDisplay", each 
        if [status] = "draft" then "Draft"
        else if [status] = "in_progress" then "In Progress"
        else if [status] = "pending_approval" then "Pending Approval"
        else if [status] = "approved" then "Approved"
        else if [status] = "rejected" then "Rejected"
        else if [status] = "converted" then "Converted to Project"
        else [status],
        type text)
in
    AddStatusDisplay

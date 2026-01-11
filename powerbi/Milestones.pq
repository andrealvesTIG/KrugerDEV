// Power Query M Code for Milestones Data
// Replace YOUR_APP_URL with your FridayReport.AI application URL

let
    // Configuration
    BaseUrl = "YOUR_APP_URL",
    Endpoint = "/api/analytics/milestones",
    
    // Fetch data from API
    Source = Json.Document(Web.Contents(BaseUrl & Endpoint)),
    
    // Convert to table
    MilestonesTable = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    
    // Expand the record columns
    ExpandedMilestones = Table.ExpandRecordColumn(MilestonesTable, "Column1", 
        {"id", "name", "dueDate", "completed", "projectId", "projectName", 
         "organizationId", "organizationName"}),
    
    // Set data types
    TypedMilestones = Table.TransformColumnTypes(ExpandedMilestones, {
        {"id", Int64.Type},
        {"name", type text},
        {"dueDate", type date},
        {"completed", type logical},
        {"projectId", Int64.Type},
        {"projectName", type text},
        {"organizationId", Int64.Type},
        {"organizationName", type text}
    }),
    
    // Add status column based on due date and completion
    AddStatus = Table.AddColumn(TypedMilestones, "MilestoneStatus", each 
        if [completed] = true then "Completed"
        else if [dueDate] < Date.From(DateTime.LocalNow()) then "Overdue"
        else if [dueDate] <= Date.AddDays(Date.From(DateTime.LocalNow()), 7) then "Due Soon"
        else "On Track",
        type text)
in
    AddStatus

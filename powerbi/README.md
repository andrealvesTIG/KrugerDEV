# Power BI Connection Guide for FridayReport.AI

This folder contains Power Query M code files that can be imported into Power BI Desktop to connect to your FridayReport.AI analytics API.

## Prerequisites

1. Power BI Desktop installed
2. Your FridayReport.AI application running and accessible
3. Valid authentication session

## Connection Setup

### Step 1: Get Your Base URL

Replace `YOUR_APP_URL` in the query files with your actual application URL:
- Development: `https://your-repl-name.replit.app`
- Production: Your custom domain or deployment URL

### Step 2: Authentication

The API requires authentication. You'll need to:
1. Log into your FridayReport.AI application in a browser
2. In Power BI, use "Web" data source with "Anonymous" or configure OAuth

For automated refresh, you may need to set up a service account or API key authentication.

### Step 3: Import Queries

1. Open Power BI Desktop
2. Go to **Home > Transform Data** to open Power Query Editor
3. Click **New Source > Blank Query**
4. Click **Advanced Editor**
5. Paste the M code from the relevant `.pq` file
6. Click **Done** and rename the query

## Available Data Sources

| Query File | Description | Dashboard Equivalent |
|------------|-------------|---------------------|
| `Projects.pq` | All project data with metrics | Project counts, health, status |
| `Portfolios.pq` | Portfolio summaries | Portfolio count |
| `Risks.pq` | Risk data across projects | Risk metrics |
| `Issues.pq` | Issue tracking data | Issue metrics |
| `Milestones.pq` | Milestone completion | Milestone tracking |
| `Intakes.pq` | Project intake pipeline | Intake metrics |
| `Summary.pq` | Aggregated KPIs | All dashboard cards |

## Recommended Measures (DAX)

After importing the data, create these measures for your dashboard:

```dax
// Total Projects
Total Projects = COUNTROWS(Projects)

// Critical Projects (Red Health)
Critical Projects = CALCULATE(COUNTROWS(Projects), Projects[health] = "Red")

// At Risk Projects (Yellow Health)
At Risk Projects = CALCULATE(COUNTROWS(Projects), Projects[health] = "Yellow")

// Healthy Projects (Green Health)
Healthy Projects = CALCULATE(COUNTROWS(Projects), Projects[health] = "Green")

// Total Budget
Total Budget = SUM(Projects[budget])

// Average Completion
Avg Completion = AVERAGE(Projects[completionPercentage])

// Open Risks
Open Risks = CALCULATE(COUNTROWS(Risks), Risks[status] = "Open")

// High Priority Risks
High Risks = CALCULATE(COUNTROWS(Risks), OR(Risks[probability] = "High", Risks[impact] = "High"))

// Open Issues
Open Issues = CALCULATE(COUNTROWS(Issues), Issues[status] = "Open")

// Completed Milestones %
Milestone Completion % = DIVIDE(
    CALCULATE(COUNTROWS(Milestones), Milestones[completed] = TRUE()),
    COUNTROWS(Milestones),
    0
)

// Intakes Pending Review
Pending Intakes = CALCULATE(
    COUNTROWS(Intakes), 
    OR(Intakes[status] = "draft", Intakes[status] = "in_progress")
)
```

## Dashboard Layout Recommendations

To match the FridayReport.AI Dashboard:

### Row 1: KPI Cards
- Total Projects
- Total Portfolios  
- Critical Projects
- Total Budget

### Row 2: Intake Metrics
- Total Intakes
- Pending Review
- Approved
- Rejected

### Row 3: Charts
- **Pie Chart**: Project Health (Green/Yellow/Red)
- **Bar Chart**: Projects by Status

### Row 4: Tables
- Recent Projects list
- Open Risks summary

## Refresh Schedule

For Power BI Service:
1. Publish your report to Power BI Service
2. Configure a gateway if needed
3. Set up scheduled refresh (daily/hourly)

## Troubleshooting

**401 Unauthorized**: Ensure you're authenticated. The API requires a valid session.

**No Data**: Check that you have organizations with projects in your account.

**Connection Timeout**: Verify your app URL is correct and accessible.

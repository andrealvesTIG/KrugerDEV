import { documentRoutes } from '../route-registry';

/**
 * OpenAPI documentation for integration-service routes that are still bound
 * directly via `app.get/post/...` inside the integration setup functions
 * (Microsoft Planner, Project Online, Dynamics 365, Microsoft Dataverse) and
 * for the RFI/submittal revision sub-resources. These are session-OAuth-
 * stateful and not worth refactoring through `apiRoute`, but they still need
 * to appear in `/api-docs` so the coverage check passes.
 *
 * Call this once after all routes have been registered.
 */
export function registerIntegrationRouteDocs(): void {
  documentRoutes([
    // Microsoft Planner
    ['get',  '/api/planner/status',                     'Planner', 'Get Planner connection status'],
    ['post', '/api/planner/connect',                    'Planner', 'Begin Planner OAuth connect flow'],
    ['get',  '/api/planner/callback',                   'Planner', 'Planner OAuth callback'],
    ['post', '/api/planner/disconnect',                 'Planner', 'Disconnect Planner integration'],
    ['get',  '/api/planner/plans',                      'Planner', 'List Planner plans'],
    ['get',  '/api/planner/plans/:planId',              'Planner', 'Get Planner plan details'],
    ['get',  '/api/planner/plans/:planId/tasks',        'Planner', 'List tasks for a Planner plan'],
    ['get',  '/api/microsoft/user-photo',               'Planner', 'Get Microsoft Graph user photo'],

    // Microsoft Entra
    ['get',  '/api/entra/status',                       'Entra',   'Get Entra connection status'],
    ['post', '/api/entra/connect',                      'Entra',   'Begin Entra OAuth connect flow'],
    ['get',  '/api/entra/callback',                     'Entra',   'Entra OAuth callback'],
    ['post', '/api/entra/disconnect',                   'Entra',   'Disconnect Entra integration'],

    // Project Online
    ['get',  '/api/project-online/status',                       'Project Online', 'Get Project Online connection status'],
    ['post', '/api/project-online/connect',                      'Project Online', 'Begin Project Online OAuth flow'],
    ['get',  '/api/project-online/callback',                     'Project Online', 'Project Online OAuth callback'],
    ['post', '/api/project-online/disconnect',                   'Project Online', 'Disconnect Project Online'],
    ['get',  '/api/project-online/projects',                     'Project Online', 'List Project Online projects'],
    ['get',  '/api/project-online/projects/:projectId/tasks',    'Project Online', 'List tasks for a Project Online project'],
    ['post', '/api/project-online/import',                       'Project Online', 'Import a project from Project Online'],
    ['post', '/api/project-online/timesheets/preview',           'Project Online', 'Preview a timesheet sync from Project Online actuals'],
    ['post', '/api/project-online/timesheets/import',            'Project Online', 'Sync resource actual hours from Project Online into timesheets'],

    // Dynamics 365 Sales
    ['get',  '/api/dynamics365/status',                          'Dynamics 365', 'Get Dynamics 365 connection status'],
    ['post', '/api/dynamics365/set-environment',                 'Dynamics 365', 'Set Dynamics 365 environment URL'],
    ['post', '/api/dynamics365/connect',                         'Dynamics 365', 'Begin Dynamics 365 OAuth flow'],
    ['get',  '/api/dynamics365/callback',                        'Dynamics 365', 'Dynamics 365 OAuth callback'],
    ['post', '/api/dynamics365/disconnect',                      'Dynamics 365', 'Disconnect Dynamics 365'],
    ['post', '/api/dynamics365/refresh',                         'Dynamics 365', 'Refresh Dynamics 365 access token'],
    ['get',  '/api/dynamics365/invoices',                        'Dynamics 365', 'List Dynamics 365 invoices'],
    ['get',  '/api/dynamics365/invoices/:invoiceId',             'Dynamics 365', 'Get a Dynamics 365 invoice'],

    // Microsoft Dataverse
    ['get',  '/api/dataverse/status',                            'Dataverse', 'Get Dataverse connection status'],
    ['post', '/api/dataverse/set-environment',                   'Dataverse', 'Set Dataverse environment URL'],
    ['post', '/api/dataverse/connect',                           'Dataverse', 'Begin Dataverse OAuth flow'],
    ['get',  '/api/dataverse/callback',                          'Dataverse', 'Dataverse OAuth callback'],
    ['post', '/api/dataverse/disconnect',                        'Dataverse', 'Disconnect Dataverse'],
    ['get',  '/api/dataverse/plans',                             'Dataverse', 'List Dataverse plans'],
    ['get',  '/api/dataverse/plans/:planId',                     'Dataverse', 'Get a Dataverse plan'],
    ['get',  '/api/dataverse/plans/:planId/tasks',               'Dataverse', 'List tasks for a Dataverse plan'],

    // RFI responses (sub-resource)
    ['post',   '/api/projects/:projectId/rfis/:rfiId/responses',                       'RFIs', 'Add a response to an RFI'],
    ['patch',  '/api/projects/:projectId/rfis/:rfiId/responses/:responseId',           'RFIs', 'Update an RFI response'],
    ['delete', '/api/projects/:projectId/rfis/:rfiId/responses/:responseId',           'RFIs', 'Delete an RFI response'],

    // Submittal revisions (sub-resource)
    ['post',   '/api/projects/:projectId/submittals/:submittalId/revisions',                              'Submittals', 'Add a revision to a submittal'],
    ['patch',  '/api/projects/:projectId/submittals/:submittalId/revisions/:revisionId',                  'Submittals', 'Update a submittal revision'],
    ['patch',  '/api/projects/:projectId/submittals/:submittalId/revisions/:revisionId/review',           'Submittals', 'Review a submittal revision'],
    ['delete', '/api/projects/:projectId/submittals/:submittalId/revisions/:revisionId',                  'Submittals', 'Delete a submittal revision'],

    // Submittal/RFI base routes (currently bound directly via app.method)
    ['get',    '/api/projects/:projectId/rfis',                        'RFIs', 'List RFIs for a project'],
    ['get',    '/api/projects/:projectId/rfis/:rfiId',                 'RFIs', 'Get an RFI'],
    ['post',   '/api/projects/:projectId/rfis',                        'RFIs', 'Create an RFI'],
    ['patch',  '/api/projects/:projectId/rfis/:rfiId',                 'RFIs', 'Update an RFI'],
    ['delete', '/api/projects/:projectId/rfis/:rfiId',                 'RFIs', 'Delete an RFI'],
    ['get',    '/api/projects/:projectId/submittals',                  'Submittals', 'List submittals for a project'],
    ['get',    '/api/projects/:projectId/submittals/:submittalId',     'Submittals', 'Get a submittal'],
    ['post',   '/api/projects/:projectId/submittals',                  'Submittals', 'Create a submittal'],
    ['patch',  '/api/projects/:projectId/submittals/:submittalId',     'Submittals', 'Update a submittal'],
    ['delete', '/api/projects/:projectId/submittals/:submittalId',     'Submittals', 'Delete a submittal'],
  ]);
}

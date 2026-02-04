import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOrganization } from "@/hooks/use-organization";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Plus, Mail, Clock, Calendar, Trash2, Send, Edit2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Dashboard {
  id: string;
  name: string;
  description: string;
}

interface ReportSubscription {
  id: number;
  userId: string;
  organizationId: number;
  name: string;
  dashboards: string[];
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string;
  recipients: string[] | null;
  isActive: boolean;
  lastSentAt: string | null;
  nextScheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central European (CET)" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Asia/Shanghai", label: "China (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const subscriptionFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  dashboards: z.array(z.string()).min(1, "Select at least one dashboard"),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.number().min(0).max(6).nullable(),
  dayOfMonth: z.number().min(1).max(28).nullable(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  timezone: z.string().min(1, "Timezone is required"),
  recipients: z.string().optional(),
  isActive: z.boolean().optional(),
});

type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;

export default function ReportSubscriptions() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<ReportSubscription | null>(null);
  
  const form = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: {
      name: "",
      dashboards: [],
      frequency: "weekly",
      dayOfWeek: 1,
      dayOfMonth: 1,
      timeOfDay: "09:00",
      timezone: "America/New_York",
      recipients: "",
      isActive: true,
    },
  });
  
  const watchFrequency = form.watch("frequency");
  
  const { data: dashboards = [], isLoading: dashboardsLoading } = useQuery<Dashboard[]>({
    queryKey: ['/api/report-subscriptions/dashboards'],
    enabled: !!currentOrganization?.id,
  });
  
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useQuery<ReportSubscription[]>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'report-subscriptions'],
    enabled: !!currentOrganization?.id,
  });
  
  const createMutation = useMutation({
    mutationFn: async (data: SubscriptionFormValues) => {
      const recipients = data.recipients
        ?.split(",")
        .map(e => e.trim())
        .filter(e => e.length > 0) || [];
      
      return apiRequest('POST', `/api/organizations/${currentOrganization?.id}/report-subscriptions`, {
        ...data,
        dayOfWeek: data.frequency === 'weekly' ? data.dayOfWeek : null,
        dayOfMonth: data.frequency === 'monthly' ? data.dayOfMonth : null,
        recipients,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'report-subscriptions'] });
      toast({ title: "Subscription created", description: "Your report subscription has been set up successfully." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create subscription", variant: "destructive" });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: SubscriptionFormValues }) => {
      const recipients = data.recipients
        ?.split(",")
        .map(e => e.trim())
        .filter(e => e.length > 0) || [];
      
      return apiRequest('PUT', `/api/organizations/${currentOrganization?.id}/report-subscriptions/${id}`, {
        ...data,
        dayOfWeek: data.frequency === 'weekly' ? data.dayOfWeek : null,
        dayOfMonth: data.frequency === 'monthly' ? data.dayOfMonth : null,
        recipients,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'report-subscriptions'] });
      toast({ title: "Subscription updated", description: "Your report subscription has been updated." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update subscription", variant: "destructive" });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/organizations/${currentOrganization?.id}/report-subscriptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'report-subscriptions'] });
      toast({ title: "Subscription deleted", description: "The report subscription has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete subscription", variant: "destructive" });
    },
  });
  
  const sendNowMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/organizations/${currentOrganization?.id}/report-subscriptions/${id}/send-now`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'report-subscriptions'] });
      toast({ title: "Report sent", description: "The report has been sent to all recipients." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send report", variant: "destructive" });
    },
  });
  
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest('PUT', `/api/organizations/${currentOrganization?.id}/report-subscriptions/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'report-subscriptions'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update subscription", variant: "destructive" });
    },
  });
  
  const openCreateDialog = () => {
    setEditingSubscription(null);
    form.reset({
      name: "",
      dashboards: [],
      frequency: "weekly",
      dayOfWeek: 1,
      dayOfMonth: 1,
      timeOfDay: "09:00",
      timezone: "America/New_York",
      recipients: "",
      isActive: true,
    });
    setIsDialogOpen(true);
  };
  
  const openEditDialog = (subscription: ReportSubscription) => {
    setEditingSubscription(subscription);
    form.reset({
      name: subscription.name,
      dashboards: subscription.dashboards,
      frequency: subscription.frequency as "daily" | "weekly" | "monthly",
      dayOfWeek: subscription.dayOfWeek ?? 1,
      dayOfMonth: subscription.dayOfMonth ?? 1,
      timeOfDay: subscription.timeOfDay,
      timezone: subscription.timezone,
      recipients: subscription.recipients?.join(", ") || "",
      isActive: subscription.isActive,
    });
    setIsDialogOpen(true);
  };
  
  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingSubscription(null);
  };
  
  const onSubmit = (data: SubscriptionFormValues) => {
    if (editingSubscription) {
      updateMutation.mutate({ id: editingSubscription.id, data });
    } else {
      createMutation.mutate(data);
    }
  };
  
  const getFrequencyLabel = (sub: ReportSubscription) => {
    switch (sub.frequency) {
      case 'daily':
        return `Daily at ${sub.timeOfDay}`;
      case 'weekly':
        const day = DAYS_OF_WEEK.find(d => d.value === sub.dayOfWeek)?.label || 'Monday';
        return `Every ${day} at ${sub.timeOfDay}`;
      case 'monthly':
        return `Monthly on day ${sub.dayOfMonth} at ${sub.timeOfDay}`;
      default:
        return sub.frequency;
    }
  };
  
  const getDashboardNames = (dashboardIds: string[]) => {
    return dashboardIds
      .map(id => dashboards.find(d => d.id === id)?.name || id)
      .join(", ");
  };
  
  const isLoading = dashboardsLoading || subscriptionsLoading;
  
  return (
    <AppLayout>
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Scheduled Reports</h1>
            <p className="text-muted-foreground">Set up automatic email delivery of dashboard reports</p>
          </div>
          <Button onClick={openCreateDialog} data-testid="button-create-subscription">
            <Plus className="h-4 w-4 mr-2" />
            New Subscription
          </Button>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : subscriptions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Report Subscriptions</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first scheduled report to receive dashboard summaries via email.
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Create Subscription
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {subscriptions.map((subscription) => (
              <Card key={subscription.id} data-testid={`card-subscription-${subscription.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-lg">{subscription.name}</CardTitle>
                      <Badge variant={subscription.isActive ? "default" : "secondary"}>
                        {subscription.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {getDashboardNames(subscription.dashboards)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={subscription.isActive}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: subscription.id, isActive: checked })}
                      data-testid={`switch-active-${subscription.id}`}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {getFrequencyLabel(subscription)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {subscription.nextScheduledAt 
                        ? `Next: ${format(new Date(subscription.nextScheduledAt), 'MMM d, yyyy h:mm a')}`
                        : "Not scheduled"}
                    </div>
                    {subscription.lastSentAt && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Last sent: {format(new Date(subscription.lastSentAt), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(subscription)}
                      data-testid={`button-edit-${subscription.id}`}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendNowMutation.mutate(subscription.id)}
                      disabled={sendNowMutation.isPending}
                      data-testid={`button-send-${subscription.id}`}
                    >
                      {sendNowMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Send Now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this subscription?")) {
                          deleteMutation.mutate(subscription.id);
                        }
                      }}
                      data-testid={`button-delete-${subscription.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingSubscription ? "Edit Report Subscription" : "Create Report Subscription"}
              </DialogTitle>
              <DialogDescription>
                Set up scheduled email delivery of dashboard reports.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subscription Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Weekly Portfolio Summary"
                          {...field}
                          data-testid="input-subscription-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dashboards"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dashboards to Include</FormLabel>
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                        {dashboards.map((dashboard) => (
                          <div key={dashboard.id} className="flex items-start space-x-3">
                            <Checkbox
                              id={`dashboard-${dashboard.id}`}
                              checked={field.value.includes(dashboard.id)}
                              onCheckedChange={(checked) => {
                                const newValue = checked
                                  ? [...field.value, dashboard.id]
                                  : field.value.filter(d => d !== dashboard.id);
                                field.onChange(newValue);
                              }}
                              data-testid={`checkbox-dashboard-${dashboard.id}`}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={`dashboard-${dashboard.id}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {dashboard.name}
                              </label>
                              <p className="text-xs text-muted-foreground">{dashboard.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="frequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequency</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-frequency">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {watchFrequency === 'weekly' && (
                    <FormField
                      control={form.control}
                      name="dayOfWeek"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Day of Week</FormLabel>
                          <Select 
                            value={String(field.value ?? 1)} 
                            onValueChange={(v) => field.onChange(Number(v))}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-day-of-week">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {DAYS_OF_WEEK.map((day) => (
                                <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {watchFrequency === 'monthly' && (
                    <FormField
                      control={form.control}
                      name="dayOfMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Day of Month</FormLabel>
                          <Select 
                            value={String(field.value ?? 1)} 
                            onValueChange={(v) => field.onChange(Number(v))}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-day-of-month">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                                <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="timeOfDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time of Day</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            data-testid="input-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="recipients"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Recipients (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="email1@example.com, email2@example.com"
                          {...field}
                          data-testid="input-recipients"
                        />
                      </FormControl>
                      <FormDescription>
                        Comma-separated email addresses. Your email is included automatically.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-subscription"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingSubscription ? "Save Changes" : "Create Subscription"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

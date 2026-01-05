import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Settings, Bell, Shield, Palette, Globe, Monitor } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function UserSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSavePreferences = () => {
    toast({
      title: "Preferences saved",
      description: "Your notification preferences have been updated.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900" data-testid="text-settings-title">User Settings</h1>
          <p className="text-slate-500">Manage your account preferences and settings</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Control how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-slate-900">Email Notifications</label>
                <p className="text-sm text-slate-500">Receive notifications via email</p>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
                data-testid="switch-email-notifications"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-slate-900">Project Updates</label>
                <p className="text-sm text-slate-500">Get notified when projects are updated</p>
              </div>
              <Switch
                checked={projectUpdates}
                onCheckedChange={setProjectUpdates}
                data-testid="switch-project-updates"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-slate-900">Task Reminders</label>
                <p className="text-sm text-slate-500">Receive reminders for upcoming tasks</p>
              </div>
              <Switch
                checked={taskReminders}
                onCheckedChange={setTaskReminders}
                data-testid="switch-task-reminders"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-slate-900">Weekly Digest</label>
                <p className="text-sm text-slate-500">Get a weekly summary of activity</p>
              </div>
              <Switch
                checked={weeklyDigest}
                onCheckedChange={setWeeklyDigest}
                data-testid="switch-weekly-digest"
              />
            </div>
            <Button onClick={handleSavePreferences} className="w-full" data-testid="button-save-preferences">
              Save Preferences
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Display Settings
            </CardTitle>
            <CardDescription>Customize your viewing experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-900">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="flex flex-col items-center gap-2 rounded-lg border border-primary bg-primary/5 p-3 transition-colors"
                  data-testid="button-theme-light"
                >
                  <Monitor className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Light</span>
                </button>
                <button
                  className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3 hover-elevate transition-colors"
                  data-testid="button-theme-dark"
                >
                  <Monitor className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-medium text-slate-500">Dark</span>
                </button>
                <button
                  className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3 hover-elevate transition-colors"
                  data-testid="button-theme-system"
                >
                  <Monitor className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-medium text-slate-500">System</span>
                </button>
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-900">Language</label>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <Globe className="h-5 w-5 text-slate-500" />
                <span className="text-sm text-slate-900">English (US)</span>
                <Badge variant="outline" size="sm" className="ml-auto">Default</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-slate-900">Connected Account</p>
                <p className="text-sm text-slate-500">Signed in via Replit</p>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-slate-900">Two-Factor Authentication</p>
                <p className="text-sm text-slate-500">Managed through Replit account</p>
              </div>
              <Badge variant="outline">Via Replit</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible account actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-red-900">Delete Account</p>
                  <p className="text-sm text-red-700">Permanently delete your account and all data</p>
                </div>
                <Button variant="destructive" size="sm" data-testid="button-delete-account">
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

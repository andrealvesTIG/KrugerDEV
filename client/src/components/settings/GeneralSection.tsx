import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Building2, Upload, Image, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Organization } from "@shared/schema";

export function GeneralSection({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [orgName, setOrgName] = useState(organization.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    setOrgName(organization.name);
  }, [organization.name]);
  
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [organization.logoUrl]);

  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('PUT', `/api/organizations/${organization.id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/organizations'] });
      setIsEditingName(false);
      toast({
        title: "Name updated",
        description: "Organization name has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update organization name. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const updateLogoMutation = useMutation({
    mutationFn: async (logoUrl: string | null) => {
      const res = await apiRequest('PUT', `/api/organizations/${organization.id}`, { logoUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/organizations'] });
      toast({
        title: "Logo updated",
        description: "Your company logo has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file (PNG, JPG, GIF, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await fetch(`/api/organizations/${organization.id}/logo/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      await response.json();
      
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      
      toast({
        title: "Success",
        description: "Your company logo has been updated successfully.",
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload logo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleRemoveLogo = () => {
    updateLogoMutation.mutate(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          General Settings
        </CardTitle>
        <CardDescription>
          Customize your organization's branding and appearance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">Organization Name</Label>
            <p className="text-sm text-muted-foreground">
              The name of your organization as it appears throughout the application.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Enter organization name"
                  className="max-w-md"
                  data-testid="input-org-name"
                />
                <Button
                  onClick={() => {
                    if (orgName.trim()) {
                      updateNameMutation.mutate(orgName.trim());
                    }
                  }}
                  disabled={!orgName.trim() || orgName.trim() === organization.name || updateNameMutation.isPending}
                  data-testid="button-save-org-name"
                >
                  {updateNameMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOrgName(organization.name);
                    setIsEditingName(false);
                  }}
                  disabled={updateNameMutation.isPending}
                  data-testid="button-cancel-org-name"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="text-lg font-medium">{orgName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingName(true)}
                  data-testid="button-edit-org-name"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div>
            <Label className="text-base font-medium">Organization ID</Label>
            <p className="text-sm text-muted-foreground">
              Unique identifier for your organization. Use this for API integrations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-3 py-2 bg-muted rounded-md text-sm font-mono" data-testid="text-org-id">
              {organization.id}
            </code>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">Company Logo</Label>
            <p className="text-sm text-muted-foreground">
              Upload your company logo to display in the sidebar. Recommended size: 48x48px or larger (square format works best).
            </p>
          </div>
          
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
                {organization.logoUrl && !logoLoadFailed ? (
                  <img 
                    src={organization.logoUrl} 
                    alt="Company Logo" 
                    className="h-full w-full object-contain"
                    onError={() => setLogoLoadFailed(true)}
                  />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground/50" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('logo-upload')?.click()}
                  disabled={isUploading || updateLogoMutation.isPending}
                  data-testid="button-upload-logo"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </>
                  )}
                </Button>
                
                {organization.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={isUploading || updateLogoMutation.isPending}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid="button-remove-logo"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-logo-upload"
              />
              
              <p className="text-xs text-muted-foreground">
                Supported formats: PNG, JPG, GIF, SVG. Max size: 5MB
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

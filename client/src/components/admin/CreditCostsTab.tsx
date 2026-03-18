import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Edit, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreditCost {
  resourceType: string;
  creditCost: number;
  displayName: string;
  description: string | null;
}

export function CreditCostsTab() {
  const { toast } = useToast();
  const [editingCost, setEditingCost] = useState<CreditCost | null>(null);
  const [newCreditCost, setNewCreditCost] = useState<number>(0);

  const { data: creditCosts, isLoading } = useQuery<CreditCost[]>({
    queryKey: ['/api/admin/credit-costs'],
    staleTime: 0,
  });

  const updateCost = useMutation({
    mutationFn: async ({ resourceType, creditCost }: { resourceType: string; creditCost: number }) => {
      return apiRequest('PUT', `/api/admin/credit-costs/${resourceType}`, { creditCost });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-costs'] });
      toast({ title: "Success", description: "Credit cost updated" });
      setEditingCost(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update credit cost", variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Credit Pricing
          </CardTitle>
          <CardDescription>
            Manage how many credits each resource type costs when created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource Type</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Credits Cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditCosts?.map((cost) => (
                <TableRow key={cost.resourceType} data-testid={`credit-cost-row-${cost.resourceType}`}>
                  <TableCell className="font-mono text-sm">{cost.resourceType}</TableCell>
                  <TableCell>{cost.displayName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{cost.description || '-'}</TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="flex items-center justify-end gap-2">
                      {editingCost?.resourceType === cost.resourceType ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newCreditCost / 100}
                          onChange={(e) => setNewCreditCost(Math.round(parseFloat(e.target.value) * 100) || 0)}
                          className="w-24 text-right"
                          data-testid={`input-credit-cost-${cost.resourceType}`}
                        />
                      ) : (
                        <span className="font-semibold">{(cost.creditCost / 100).toFixed(cost.creditCost % 100 === 0 ? 0 : 2)}</span>
                      )}
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        credits
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {editingCost?.resourceType === cost.resourceType ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCost(null)}
                          data-testid={`button-cancel-edit-${cost.resourceType}`}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateCost.mutate({ resourceType: cost.resourceType, creditCost: newCreditCost })}
                          disabled={updateCost.isPending}
                          data-testid={`button-save-${cost.resourceType}`}
                        >
                          {updateCost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCost(cost);
                          setNewCreditCost(cost.creditCost);
                        }}
                        data-testid={`button-edit-${cost.resourceType}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit Pricing Guide</CardTitle>
          <CardDescription>Reference for setting credit costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">1 credit</div>
              <div className="text-muted-foreground">Task, issue, risk, document</div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">5 credits</div>
              <div className="text-muted-foreground">Project (complex)</div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">10 credits</div>
              <div className="text-muted-foreground">Portfolio (strategic)</div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">3 credits</div>
              <div className="text-muted-foreground">AI Run, Reports</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Adjust costs based on the complexity and resource intensity of each action. 
            Higher costs for resource-intensive operations, lower costs for simple data entries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

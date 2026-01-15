import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function SignInWaitingPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const email = params.get("email") || "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
          <CardDescription>
            We sent a sign-in link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Click the link in your email to sign in. The link will expire in 15 minutes.
          </p>
          <div className="text-center space-y-3">
            <Link href="/signin">
              <Button 
                variant="outline" 
                className="w-full"
                data-testid="button-try-different-email"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Try a different email
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              Didn't receive the email? Check your spam folder or{" "}
              <Link href="/signin" className="text-primary hover:underline">
                request another link
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

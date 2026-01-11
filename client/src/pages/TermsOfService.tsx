import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
      
      <h1 className="text-3xl font-bold mb-6" data-testid="text-terms-title">Terms of Service</h1>
      
      <div className="prose dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: January 2026</p>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
          <p className="text-muted-foreground">
            By accessing and using FridayReport.AI ("the Service"), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
          <p className="text-muted-foreground">
            FridayReport.AI is a project portfolio management platform that helps organizations track projects, portfolios, risks, milestones, and issues. The Service includes features for data visualization, reporting, and team collaboration.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
          <p className="text-muted-foreground">
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
          <p className="text-muted-foreground">
            You agree not to use the Service to: (a) violate any applicable laws or regulations; (b) infringe upon the rights of others; (c) transmit harmful, offensive, or illegal content; (d) attempt to gain unauthorized access to the Service or its systems.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">5. Data and Privacy</h2>
          <p className="text-muted-foreground">
            Your use of the Service is also governed by our Privacy Statement. By using the Service, you consent to the collection and use of information as described in our Privacy Statement.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
          <p className="text-muted-foreground">
            The Service and its original content, features, and functionality are owned by Friday Report LLC and are protected by international copyright, trademark, and other intellectual property laws.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">7. Limitation of Liability</h2>
          <p className="text-muted-foreground">
            In no event shall Friday Report LLC be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your use of the Service.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">8. Changes to Terms</h2>
          <p className="text-muted-foreground">
            We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the updated terms on this page with a new effective date.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">9. Contact Information</h2>
          <p className="text-muted-foreground">
            If you have any questions about these Terms of Service, please contact us at support@fridayreport.ai.
          </p>
        </section>
      </div>
    </div>
  );
}

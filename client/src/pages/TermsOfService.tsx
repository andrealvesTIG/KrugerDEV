import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Helmet>
        <title>Terms of Service - FridayReport.AI</title>
        <meta name="description" content="Terms of Service for FridayReport.AI project portfolio management software. Read our terms and conditions for using the service." />
        <link rel="canonical" href="https://fridayreport.ai/terms" />
      </Helmet>
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
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
            FridayReport.AI is a project portfolio management platform that helps organizations track projects, portfolios, risks, portfolio key dates, and issues. The Service includes features for data visualization, reporting, and team collaboration.
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
          <h2 className="text-xl font-semibold mb-3">8. Service Usage and Fees</h2>
          
          <h3 className="text-lg font-medium mt-4 mb-2">8.1 Excessive Usage</h3>
          <p className="text-muted-foreground mb-4">
            We shall have the right, including without limitation where we, at our sole discretion, believe that Customer and/or any of its Users, have misused the Services or otherwise use the Services in an excessive manner compared to the anticipated standard use at our sole discretion (for instance, an excessive number of guests, excessive use of automations, etc.), to offer the Services in different pricing and/or impose additional fees or other restrictions as for the upload, storage, download and/or use of the Services, including, without limitation, restrictions on Third Party Services, network traffic and bandwidth, size and/or length of content, quality and/or format of content, sources of content, volume of download time, etc.
          </p>
          
          <h3 className="text-lg font-medium mt-4 mb-2">8.2 Discounts and Promotions</h3>
          <p className="text-muted-foreground mb-4">
            Unless expressly stated otherwise in a separate legally binding agreement, if Customer received a special discount or other promotional offer, Customer acknowledges that upon renewal of the Subscription to the Services, FridayReport.AI will renew such Subscription to the Services, at the full applicable Fee at the time of renewal.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">9. Changes to Terms</h2>
          <p className="text-muted-foreground">
            We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the updated terms on this page with a new effective date.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">10. Trial Services and Free Versions</h2>
          <p className="text-muted-foreground">
            We may offer, from time to time, part or all of our Services on a free, no-obligation trial and/or in connection with a free Subscription Plan to the Services for a limited duration and with limited functionality ("Trial Services"). The term of the Trial Services shall be as communicated to you within the Services, in an Order Form or separately in writing by FridayReport.AI, unless terminated earlier by either Customer or us, for any reason or for no reason. We reserve the right to modify, cancel and/or limit the Trial Services at any time, with or without notice, and without liability or explanation to you. In respect of the Trial Services, upon termination, we may change the Account web address at any time without any prior written notice.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
          
          <h3 className="text-lg font-medium mt-4 mb-2">11.1 Termination for Cause</h3>
          <p className="text-muted-foreground mb-4">
            In addition to any other remedies it may have, either party may terminate these Terms, if (i) the other party breaches these Terms and fails to cure such breach within thirty (30) days of its receipt of a written notice identifying the breach in reasonable detail (or ten (10) days in the case of non-payment), or (ii) subject to applicable law, upon the other party's liquidation, commencement of dissolution proceedings or assignment of substantially all of its assets for the benefit of creditors.
          </p>
          
          <h3 className="text-lg font-medium mt-4 mb-2">11.2 Termination for Convenience</h3>
          <p className="text-muted-foreground mb-4">
            In addition to the right to terminate for cause, (a) for paid subscriptions, we may terminate these Terms for convenience by providing you at least thirty (30) days' prior written notice; and (b) for unpaid accounts only, either party may terminate these Terms, effective immediately, by providing the other party written notice. For paid subscriptions, you will pay in full for the Service up to and including the last day on which the Service is provided.
          </p>
          
          <h3 className="text-lg font-medium mt-4 mb-2">11.3 Effect of Termination</h3>
          <p className="text-muted-foreground mb-4">
            Upon expiration or termination of the Terms for any reason: (1) all of your rights under these Terms will immediately terminate and you will immediately cease all access to and use of the Platform; (2) you acknowledge and agree that your access to the Services may be automatically terminated, all passwords and individual accounts removed, and all information that has been uploaded into FridayReport.AI's systems by you may be destroyed; and (3) you may retain copies of your data that you exported prior to termination.
          </p>
          
          <h3 className="text-lg font-medium mt-4 mb-2">11.4 Inactivity</h3>
          <p className="text-muted-foreground mb-4">
            For non-paying customers, if there is no activity in your account for six (6) months or more, FridayReport.AI reserves the right to deactivate your account, delete data from your account and/or restrict access to certain functionality in your account, at FridayReport.AI's sole discretion.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">12. Contact Information</h2>
          <p className="text-muted-foreground">
            If you have any questions about these Terms of Service, please contact us at support@fridayreport.ai.
          </p>
        </section>
      </div>
      </div>
      <Footer />
    </div>
  );
}

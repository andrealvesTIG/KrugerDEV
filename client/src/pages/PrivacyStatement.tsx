import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";

export default function PrivacyStatement() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Helmet>
        <title>Privacy Policy - FridayReport.AI</title>
        <meta name="description" content="Privacy Policy for FridayReport.AI project portfolio management software. Learn how we collect, use, and protect your data." />
        <link rel="canonical" href="https://fridayreport.ai/privacy" />
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
      
      <h1 className="text-3xl font-bold mb-6" data-testid="text-privacy-title">Privacy Statement</h1>
      
      <div className="prose dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: January 2026</p>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
          <p className="text-muted-foreground">
            Friday Report LLC ("we", "our", or "us") is committed to protecting your privacy. This Privacy Statement explains how we collect, use, disclose, and safeguard your information when you use FridayReport.AI.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
          <p className="text-muted-foreground">
            We may collect personal information that you provide directly to us, including: name, email address, organization information, and any other information you choose to provide. We also collect usage data, including information about how you interact with the Service.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
          <p className="text-muted-foreground">
            We use the information we collect to: (a) provide and maintain the Service; (b) improve and personalize your experience; (c) communicate with you about the Service; (d) monitor and analyze usage patterns; (e) protect against unauthorized access and ensure security.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">4. Data Sharing and Disclosure</h2>
          <p className="text-muted-foreground">
            We do not sell your personal information. We may share your information with: service providers who assist in operating our Service; when required by law; to protect our rights and safety; or with your consent.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">5. Data Security</h2>
          <p className="text-muted-foreground">
            We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet is 100% secure.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
          <p className="text-muted-foreground">
            We retain your personal information for as long as necessary to provide the Service and fulfill the purposes described in this Privacy Statement, unless a longer retention period is required by law.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
          <p className="text-muted-foreground">
            Depending on your location, you may have certain rights regarding your personal information, including the right to access, correct, delete, or port your data. To exercise these rights, please contact us.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">8. Cookies and Tracking</h2>
          <p className="text-muted-foreground">
            We use cookies and similar tracking technologies to collect usage information and improve the Service. You can control cookies through your browser settings.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">9. Changes to This Statement</h2>
          <p className="text-muted-foreground">
            We may update this Privacy Statement from time to time. We will notify you of any changes by posting the new Privacy Statement on this page and updating the effective date.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
          <p className="text-muted-foreground">
            If you have any questions about this Privacy Statement, please contact us at privacy@fridayreport.ai.
          </p>
        </section>
      </div>
      </div>
      <Footer />
    </div>
  );
}

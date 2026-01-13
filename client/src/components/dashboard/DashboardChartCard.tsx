import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Link } from "wouter";

interface DashboardChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  href?: string;
  delay?: number;
  testId?: string;
  className?: string;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 }
};

export function DashboardChartCard({
  title,
  description,
  children,
  href,
  delay = 0.5,
  testId,
  className = "",
}: DashboardChartCardProps) {
  const content = (
    <Card className={`shadow-sm hover:shadow-md transition-shadow ${href ? 'cursor-pointer' : ''} ${className}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="h-[300px]">
        {children}
      </CardContent>
    </Card>
  );

  return (
    <motion.div {...fadeIn} transition={{ delay }}>
      {href ? (
        <Link href={href} data-testid={testId}>
          {content}
        </Link>
      ) : (
        <div data-testid={testId}>
          {content}
        </div>
      )}
    </motion.div>
  );
}

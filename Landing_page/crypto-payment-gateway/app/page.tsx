import Link from "next/link"
import {
  ArrowRight,
  CheckCircle,
  CreditCard,
  Database,
  EclipseIcon as Ethereum,
  Globe,
  Lock,
  RefreshCcw,
  Shield,
  Wallet,
  Zap,
  BarChart3,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { FeatureCard } from "@/components/feature-card"
import { SectionTitle } from "@/components/section-title"
import { StatCard } from "@/components/stat-card"
import { EthereumCoinsBackground } from "@/components/ethereum-coins-background"
import { EthereumShowcase } from "@/components/ethereum-showcase"
import { PaymentCard } from "@/components/payment-card"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-grid-pattern">
      <EthereumCoinsBackground />
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Zap className="h-6 w-6 text-teal-400" />
              <div className="absolute -inset-1 rounded-full bg-teal-400/20 blur-sm -z-10"></div>
            </div>
            <span className="text-xl font-bold">CryptoGate</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <Link href="#features" className="text-sm font-medium hover:text-teal-400 transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-sm font-medium hover:text-teal-400 transition-colors">
              How It Works
            </Link>
            <Link href="#security" className="text-sm font-medium hover:text-teal-400 transition-colors">
              Security
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="#contact" className="text-sm font-medium hover:text-teal-400 transition-colors hidden md:block">
              Contact
            </Link>
            <a href="http://localhost:3000/onboarding.html" target="_blank" ><Button className="bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-500 hover:to-blue-600 border-none">
              Get Started
            </Button> </a>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <section className="py-20 md:py-28 relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] bg-teal-400/5 rounded-full blur-3xl"></div>
            <div className="absolute top-[60%] -left-[5%] w-[30%] h-[40%] bg-blue-500/5 rounded-full blur-3xl"></div>
            <div className="absolute top-[40%] right-[20%] w-[15%] h-[20%] bg-teal-400/10 rounded-full blur-2xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <div className="inline-block rounded-lg bg-white/5 px-3 py-1 text-sm text-teal-400 border border-teal-400/20">
                    [ Ethereum Payments ]
                  </div>
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    HD Wallet-Based <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">Ethereum</span> Payment Gateway
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Secure, private, and traceable Ethereum payments for your business with unique addresses for every
                    transaction.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
               <a href="http://localhost:3000/onboarding.html"> <Button size="lg" className="group bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-500 hover:to-blue-600 border-none">
                    Start Accepting ETH
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button> </a>
                 <a href="http://localhost:3000/onboarding.html" target="_blank" ><Button size="lg" variant="outline" className="border-white/10 hover:bg-white/5">
                    View Demo
                  </Button> </a> 
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-teal-400" />
                    <span>No KYC Required</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-teal-400" />
                    <span>Instant Setup</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-teal-400" />
                    <span>Low Fees</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center h-full w-full">
                <EthereumShowcase />
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 relative overflow-hidden bg-gradient-glow">
          <div className="container px-4 md:px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard 
                title="Total Transactions" 
                value="1.2M+" 
                icon={<BarChart3 className="h-6 w-6" />}
                gradientFrom="from-teal-400"
                gradientTo="to-blue-500"
              />
              <StatCard 
                title="Processing Volume" 
                value="$256.9M" 
                icon={<Database className="h-6 w-6" />}
                gradientFrom="from-blue-400"
                gradientTo="to-purple-500"
              />
              <StatCard 
                title="Merchants" 
                value="5,400+" 
                icon={<CreditCard className="h-6 w-6" />}
                gradientFrom="from-teal-400"
                gradientTo="to-green-500"
              />
              <StatCard 
                title="Avg. Transaction" 
                value="0.18 ETH" 
                icon={<Ethereum className="h-6 w-6" />}
                gradientFrom="from-blue-400"
                gradientTo="to-indigo-500"
              />
            </div>
          </div>
        </section>

        <section className="py-20 relative overflow-hidden">
          <div className="container px-4 md:px-6 relative flex justify-center items-center">
            <PaymentCard />
          </div>
        </section>

        <section id="features" className="py-20 relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[5%] -left-[5%] w-[20%] h-[20%] bg-teal-400/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-[10%] right-[5%] w-[25%] h-[25%] bg-blue-500/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <SectionTitle 
              title="Key Features" 
              subtitle="Features"
              accentWord="Features"
            />
            
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={<Wallet className="h-6 w-6" />}
                title="Unique Payment Addresses"
                description="Generate a unique Ethereum address for each transaction using HD wallet technology, enhancing privacy and traceability."
              />
              <FeatureCard
                icon={<Lock className="h-6 w-6" />}
                title="Encrypted Key Management"
                description="Advanced encryption for private keys with multi-layer security protocols to protect your ETH funds."
                gradientFrom="from-blue-400"
                gradientTo="to-purple-500"
              />
              <FeatureCard
                icon={<RefreshCcw className="h-6 w-6" />}
                title="Real-Time Monitoring"
                description="Monitor Ethereum transactions in real-time with instant notifications and detailed transaction history."
                gradientFrom="from-teal-400"
                gradientTo="to-green-500"
              />
              <FeatureCard
                icon={<CreditCard className="h-6 w-6" />}
                title="Merchant Dashboard"
                description="Comprehensive dashboard for managing payments, viewing analytics, and releasing funds to your Ethereum wallet."
                gradientFrom="from-blue-400"
                gradientTo="to-indigo-500"
              />
              <FeatureCard
                icon={<Globe className="h-6 w-6" />}
                title="Multiple RPC Providers"
                description="Support for multiple Ethereum RPC providers ensures high availability and reliability for your transactions."
              />
              <FeatureCard
                icon={<Shield className="h-6 w-6" />}
                title="Recovery Tools"
                description="Robust wallet recovery tools, Ethereum address derivation fixes, and fund release testing capabilities."
                gradientFrom="from-blue-400"
                gradientTo="to-purple-500"
              />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-20 relative overflow-hidden bg-gradient-glow">
          <div className="container px-4 md:px-6 relative">
            <SectionTitle
              title="How It Works"
              subtitle="Process"
              accentWord="Works"
            />
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
              <div className="relative flex flex-col items-center text-center p-6 bg-black/30 rounded-xl border border-white/10 shadow-md hover:shadow-lg transition-all hover:-translate-y-1 duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-blue-500/5 rounded-xl"></div>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-teal-400 to-blue-500 text-white relative z-10"> 
                  <span className="text-xl font-bold">1</span>
                </div>
                <h3 className="mb-2 text-xl font-bold relative z-10">Integration</h3>
                <p className="text-muted-foreground relative z-10">
                  Easily integrate our Ethereum payment gateway into your website or application.
                </p>
              </div>
              <div className="relative flex flex-col items-center text-center p-6 bg-black/30 rounded-xl border border-white/10 shadow-md hover:shadow-lg transition-all hover:-translate-y-1 duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-blue-500/5 rounded-xl"></div>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-teal-400 to-blue-500 text-white relative z-10">
                  <span className="text-xl font-bold">2</span>
                </div>
                <h3 className="mb-2 text-xl font-bold relative z-10">Customer Payment</h3>
                <p className="text-muted-foreground relative z-10">
                  Customers receive a unique Ethereum address for their transaction, ensuring privacy and security.
                </p>
              </div>
              <div className="relative flex flex-col items-center text-center p-6 bg-black/30 rounded-xl border border-white/10 shadow-md hover:shadow-lg transition-all hover:-translate-y-1 duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-blue-500/5 rounded-xl"></div>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-teal-400 to-blue-500 text-white relative z-10">
                  <span className="text-xl font-bold">3</span>
                </div>
                <h3 className="mb-2 text-xl font-bold relative z-10">Confirmation & Settlement</h3>
                <p className="text-muted-foreground relative z-10">
                  Transactions are confirmed on the Ethereum blockchain and funds are securely transferred to your wallet.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="py-20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[30%] -right-[5%] w-[25%] h-[40%] bg-teal-400/5 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="grid gap-12 lg:grid-cols-2">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <div className="inline-block rounded-lg bg-white/5 px-3 py-1 text-sm text-teal-400 border border-teal-400/20">
                    [ Security First ]
                  </div>
                  <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                    Enterprise-Grade <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">Security</span>
                  </h2>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Our Ethereum payment gateway is built with security as the top priority, protecting both merchants
                    and customers.
                  </p>
                </div>
                <ul className="grid gap-4">
                  <li className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-400/10">
                      <CheckCircle className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-bold">Hierarchical Deterministic Wallets</h3>
                      <p className="text-muted-foreground">
                        HD wallets generate unique Ethereum addresses while maintaining a single recovery seed,
                        enhancing security and privacy.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-400/10">
                      <CheckCircle className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-bold">Multi-Layer Encryption</h3>
                      <p className="text-muted-foreground">
                        Private keys are protected with multiple layers of encryption, ensuring they remain secure at
                        all times.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-400/10">
                      <CheckCircle className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-bold">Redundant Infrastructure</h3>
                      <p className="text-muted-foreground">
                        Multiple Ethereum RPC providers and redundant systems ensure high availability and reliability.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-400/10">
                      <CheckCircle className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-bold">Regular Security Audits</h3>
                      <p className="text-muted-foreground">
                        Our system undergoes regular security audits by independent third-party experts.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative w-full max-w-[500px] overflow-hidden rounded-xl border border-white/10 bg-black/30 p-6 shadow-xl">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-teal-400/10 blur-3xl"></div>
                  <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"></div>
                  <div className="relative space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                        <Lock className="h-6 w-6 text-teal-400" />
                      </div>
                      <div>
                        <h3 className="font-bold">Encrypted Private Keys</h3>
                        <p className="text-sm text-muted-foreground">AES-256 encryption standard</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                        <Shield className="h-6 w-6 text-teal-400" />
                      </div>
                      <div>
                        <h3 className="font-bold">Secure Recovery System</h3>
                        <p className="text-sm text-muted-foreground">BIP39 mnemonic seed phrases</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                        <Database className="h-6 w-6 text-teal-400" />
                      </div>
                      <div>
                        <h3 className="font-bold">Isolated Storage</h3>
                        <p className="text-sm text-muted-foreground">Segregated and encrypted data storage</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-sm font-medium">Security Certification</div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-teal-400" />
                        <span className="text-sm">ISO 27001 Compliant</span>
                      </div>
                      <div className="mt-4 text-xs text-muted-foreground">Last security audit: April 2025</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-gradient-glow">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                  Ready to Accept <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">Ethereum</span> Payments?
                </h2>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                  Join merchants already using our secure HD wallet-based Ethereum payment gateway.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Button size="lg" className="group bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-500 hover:to-blue-600 border-none">
                  Get Started Now
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
                <Button size="lg" variant="outline" className="border-white/10 hover:bg-white/5">
                  Schedule a Demo
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer id="contact" className="border-t border-white/10 bg-black/50">
        <div className="container px-4 py-12 md:px-6 md:py-16">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-teal-400" />
                <span className="text-xl font-bold">CryptoGate</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Secure, HD wallet-based Ethereum payment gateway for merchants.
              </p>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-medium">Product</h3>
              <ul className="grid gap-2">
                <li>
                  <Link href="#features" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#security" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Security
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Documentation
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-medium">Company</h3>
              <ul className="grid gap-2">
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-medium">Legal</h3>
              <ul className="grid gap-2">
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-teal-400 transition-colors">
                    Cookies
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-white/10 pt-8">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} CryptoGate. All rights reserved.
              </p>
              <div className="flex items-center gap-4">
                <Link href="#" className="text-muted-foreground hover:text-teal-400">
                  <span className="sr-only">Twitter</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
                  </svg>
                </Link>
                <Link href="#" className="text-muted-foreground hover:text-teal-400">
                  <span className="sr-only">GitHub</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
                    <path d="M9 18c-4.51 2-5-2-7-2"></path>
                  </svg>
                </Link>
                <Link href="#" className="text-muted-foreground hover:text-teal-400">
                  <span className="sr-only">LinkedIn</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                    <rect width="4" height="12" x="2" y="9"></rect>
                    <circle cx="4" cy="4" r="2"></circle>
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link"
import { ArrowRight, CheckCircle, CreditCard, Database, Globe, Lock, RefreshCcw, Shield, Wallet } from "lucide-react"

import { BlockchainVisualization } from "@/components/blockchain-visualization"
import { EthereumLogo } from "@/components/ethereum-logo"
import { PaymentFlow } from "@/components/payment-flow"
import { SecurityShield } from "@/components/security-shield"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EthereumCoinsBackground } from "@/components/ethereum-coins-background"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-grid-pattern">
      <EthereumCoinsBackground />
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">CryptoGate</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <Link href="#features" className="text-sm font-medium hover:text-primary transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
              How It Works
            </Link>
            <Link href="#security" className="text-sm font-medium hover:text-primary transition-colors">
              Security
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="#contact" className="text-sm font-medium hover:text-primary transition-colors hidden md:block">
              Contact
            </Link>
            <Button>Get Started</Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <section className="py-20 md:py-28 relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl"></div>
            <div className="absolute top-[60%] -left-[5%] w-[30%] h-[40%] bg-primary/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary">
                    Ethereum Payments
                  </div>
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    HD Wallet-Based Ethereum Payment Gateway
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Secure, private, and traceable Ethereum payments for your business with unique addresses for every
                    transaction.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Button size="lg" className="group">
                    Start Accepting ETH
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button size="lg" variant="outline">
                    View Demo
                  </Button>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>No KYC Required</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Instant Setup</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Low Fees</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative w-full max-w-[500px] overflow-hidden rounded-lg border bg-card p-2 shadow-xl">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl"></div>
                  <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl"></div>
                  <div className="relative rounded-md border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-2">
                        <div className="relative w-5 h-5">
                          <EthereumLogo className="absolute inset-0 w-full h-full" />
                        </div>
                        <span className="font-medium">Payment Request</span>
                      </div>
                      <div className="text-sm text-muted-foreground">Transaction #38291</div>
                    </div>
                    <div className="py-4">
                      <div className="mb-4 text-center">
                        <div className="text-sm text-muted-foreground">Amount Due</div>
                        <div className="text-2xl font-bold">0.05 ETH</div>
                        <div className="text-sm text-muted-foreground">≈ $125.00 USD</div>
                      </div>
                      <div className="mx-auto mb-4 h-48 w-48 rounded-lg bg-muted p-2 flex items-center justify-center">
                        <div className="relative w-full h-full flex items-center justify-center">
                          <EthereumLogo className="w-32 h-32" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-xs text-center text-muted-foreground bg-background/80 px-2 py-1 rounded">QR Code Placeholder</div>
                          </div>
                        </div>
                      </div>
                      <div className="mb-4 rounded-md bg-muted p-2 text-center text-sm">
                        <span className="font-mono text-xs">0x7F1B543127F8c8bD92b5e3E80D9E5c3ed9b1eD75</span>
                      </div>
                      <div className="flex justify-center">
                        <Button className="w-full">Copy Address</Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <RefreshCcw className="h-3 w-3 animate-spin" />
                        <span>Refreshing...</span>
                      </div>
                      <div className="flex items-center gap-1 text-primary">
                        <Lock className="h-3 w-3" />
                        <span>Secure Connection</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-muted py-20 relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -bottom-[5%] -right-[5%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">Key Features</h2>
              <p className="mx-auto mt-4 max-w-[700px] text-muted-foreground md:text-xl">
                Our HD wallet-based payment gateway offers powerful features for secure Ethereum transactions.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="group overflow-hidden transition-all hover:shadow-lg border-secondary/50 bg-card hover:translate-y-[-5px] duration-300">
                <CardHeader className="p-6">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <CardTitle>Unique Payment Addresses</CardTitle>
                  <CardDescription>
                    Generate a unique Ethereum address for each transaction using HD wallet technology, enhancing
                    privacy and traceability.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="group overflow-hidden transition-all hover:shadow-lg border-secondary/50 bg-card hover:translate-y-[-5px] duration-300">
                <CardHeader className="p-6">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Lock className="h-6 w-6" />
                  </div>
                  <CardTitle>Encrypted Key Management</CardTitle>
                  <CardDescription>
                    Advanced encryption for private keys with multi-layer security protocols to protect your ETH funds.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="group overflow-hidden transition-all hover:shadow-lg border-secondary/50 bg-card hover:translate-y-[-5px] duration-300">
                <CardHeader className="p-6">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <RefreshCcw className="h-6 w-6" />
                  </div>
                  <CardTitle>Real-Time Monitoring</CardTitle>
                  <CardDescription>
                    Monitor Ethereum transactions in real-time with instant notifications and detailed transaction
                    history.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="group overflow-hidden transition-all hover:shadow-lg border-secondary/50 bg-card hover:translate-y-[-5px] duration-300">
                <CardHeader className="p-6">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <CardTitle>Merchant Dashboard</CardTitle>
                  <CardDescription>
                    Comprehensive dashboard for managing payments, viewing analytics, and releasing funds to your
                    Ethereum wallet.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="group overflow-hidden transition-all hover:shadow-lg border-secondary/50 bg-card hover:translate-y-[-5px] duration-300">
                <CardHeader className="p-6">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Globe className="h-6 w-6" />
                  </div>
                  <CardTitle>Multiple RPC Providers</CardTitle>
                  <CardDescription>
                    Support for multiple Ethereum RPC providers ensures high availability and reliability for your
                    transactions.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="group overflow-hidden transition-all hover:shadow-lg border-secondary/50 bg-card hover:translate-y-[-5px] duration-300">
                <CardHeader className="p-6">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Shield className="h-6 w-6" />
                  </div>
                  <CardTitle>Recovery Tools</CardTitle>
                  <CardDescription>
                    Robust wallet recovery tools, Ethereum address derivation fixes, and fund release testing
                    capabilities.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-20 relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[30%] -left-[5%] w-[20%] h-[40%] bg-primary/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">How It Works</h2>
              <p className="mx-auto mt-4 max-w-[700px] text-muted-foreground md:text-xl">
                Our payment gateway simplifies Ethereum transactions for both merchants and customers.
              </p>
            </div>
            
            <div className="mx-auto max-w-5xl mb-12">
              <PaymentFlow className="w-full h-[300px]" />
            </div>
            
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
              <div className="relative flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <span className="text-xl font-bold">1</span>
                </div>
                <h3 className="mb-2 text-xl font-bold">Integration</h3>
                <p className="text-muted-foreground">
                  Easily integrate our Ethereum payment gateway into your website or application with our API or
                  plugins.
                </p>
                <div className="absolute -right-4 hidden h-0.5 w-8 bg-border top-8 md:block"></div>
              </div>
              <div className="relative flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <span className="text-xl font-bold">2</span>
                </div>
                <h3 className="mb-2 text-xl font-bold">Customer Payment</h3>
                <p className="text-muted-foreground">
                  Customers receive a unique Ethereum address for their transaction, ensuring privacy and security.
                </p>
                <div className="absolute -right-4 hidden h-0.5 w-8 bg-border top-8 md:block"></div>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <span className="text-xl font-bold">3</span>
                </div>
                <h3 className="mb-2 text-xl font-bold">Confirmation & Settlement</h3>
                <p className="text-muted-foreground">
                  Transactions are confirmed on the Ethereum blockchain and funds are securely transferred to your
                  wallet.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="blockchain" className="py-20 bg-muted relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[10%] -right-[10%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">Blockchain Technology</h2>
              <p className="mx-auto mt-4 max-w-[700px] text-muted-foreground md:text-xl">
                Our payment gateway leverages the security and transparency of the Ethereum blockchain.
              </p>
            </div>
            
            <div className="mx-auto max-w-5xl">
              <BlockchainVisualization className="w-full h-[200px] mx-auto mb-8" />
              
              <div className="grid gap-8 md:grid-cols-3">
                <Card className="bg-card border-secondary/50">
                  <CardHeader>
                    <CardTitle>Immutable Records</CardTitle>
                    <CardDescription>
                      All transactions are permanently recorded on the Ethereum blockchain, providing an immutable audit trail.
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-card border-secondary/50">
                  <CardHeader>
                    <CardTitle>Transparent Verification</CardTitle>
                    <CardDescription>
                      Anyone can verify transaction status and history on the public Ethereum blockchain.
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-card border-secondary/50">
                  <CardHeader>
                    <CardTitle>Smart Contract Support</CardTitle>
                    <CardDescription>
                      Leverage Ethereum smart contracts for automated, programmable payment flows.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="py-20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[60%] -right-[5%] w-[25%] h-[40%] bg-primary/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="grid gap-12 lg:grid-cols-2">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary">
                    Security First
                  </div>
                  <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                    Enterprise-Grade Security
                  </h2>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Our Ethereum payment gateway is built with security as the top priority, protecting both merchants
                    and customers.
                  </p>
                </div>
                <ul className="grid gap-4">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-bold">Hierarchical Deterministic Wallets</h3>
                      <p className="text-muted-foreground">
                        HD wallets generate unique Ethereum addresses while maintaining a single recovery seed,
                        enhancing security and privacy.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-bold">Multi-Layer Encryption</h3>
                      <p className="text-muted-foreground">
                        Private keys are protected with multiple layers of encryption, ensuring they remain secure at
                        all times.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-bold">Redundant Infrastructure</h3>
                      <p className="text-muted-foreground">
                        Multiple Ethereum RPC providers and redundant systems ensure high availability and reliability.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-1 h-5 w-5 text-primary" />
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
                <div className="relative w-full max-w-[500px] overflow-hidden rounded-lg border border-secondary/50 bg-card p-6 shadow-xl">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl"></div>
                  <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl"></div>
                  
                  <div className="flex justify-center mb-6">
                    <SecurityShield className="w-32 h-32" />
                  </div>
                  
                  <div className="relative space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Lock className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold">Encrypted Private Keys</h3>
                        <p className="text-sm text-muted-foreground">AES-256 encryption standard</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold">Secure Recovery System</h3>
                        <p className="text-sm text-muted-foreground">BIP39 mnemonic seed phrases</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Database className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold">Isolated Storage</h3>
                        <p className="text-sm text-muted-foreground">Segregated and encrypted data storage</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-secondary/50 bg-muted p-4">
                      <div className="mb-2 text-sm font-medium">Security Certification</div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
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

        <section className="py-20 bg-muted relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -bottom-[10%] -left-[10%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-3xl"></div>
            <div className="absolute top-[20%] -right-[5%] w-[20%] h-[20%] bg-primary/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container px-4 md:px-6 relative">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                  Ready to Accept Ethereum Payments?
                </h2>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                  Join merchants already using our secure HD wallet-based Ethereum payment gateway.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Button size="lg" className="group">
                  Get Started Now
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
                <Button size="lg" variant="outline">
                  Schedule a Demo
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer id="contact" className="border-t border-secondary/50 bg-background">
        <div className="container px-4 py-12 md:px-6 md:py-16">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="h-6 w-6 text-primary" />
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
                  <Link href="#features" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#security" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Security
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Documentation
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-medium">Company</h3>
              <ul className="grid gap-2">
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-medium">Legal</h3>
              <ul className="grid gap-2">
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Cookies
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-secondary/50 pt-8">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} CryptoGate. All rights reserved.
              </p>
              <div className="flex items-center gap-4">
                <Link href="#" className="text-muted-foreground hover:text-primary">
                  <span className="sr-only">Twitter</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="roun\
\

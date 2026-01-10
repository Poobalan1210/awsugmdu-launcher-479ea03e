import { Link } from 'react-router-dom';
import { Github, Twitter, Linkedin, Youtube } from 'lucide-react';
import logo from '@/assets/logo.png';
export function Footer() {
  return <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-4">
              <img src={logo} alt="AWS User Group" className="h-12 w-auto" />
              
            </Link>
            <p className="text-muted-foreground text-sm max-w-md">
              Building a community of cloud enthusiasts, sharing knowledge, and helping each other grow in the AWS ecosystem.
            </p>
            <div className="flex gap-4 mt-6">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Initiatives */}
          <div>
            <h3 className="font-semibold mb-4">Initiatives</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/skill-sprint" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Builders Skill Sprint
                </Link>
              </li>
              <li>
                <Link to="/college-champs" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  College Champs
                </Link>
              </li>
              <li>
                <Link to="/certification-circle" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Certification Circle
                </Link>
              </li>
              <li>
                <Link to="/store" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Store
                </Link>
              </li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/events" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Events
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Code of Conduct
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} AWS User Group. All rights reserved.</p>
        </div>
      </div>
    </footer>;
}
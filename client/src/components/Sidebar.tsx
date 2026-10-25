import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export default function Sidebar({ open, setOpen }: SidebarProps) {
  const [location] = useLocation();

  // Close sidebar when clicking outside on mobile
  const handleOverlayClick = () => {
    setOpen(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={handleOverlayClick}
        ></div>
      )}

      {/* Sidebar */}
      <div 
        className={cn(
          "sidebar",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="sidebar-header">
          <h1 className="text-lg font-bold">Sistema Cotizador</h1>
          {/* Mobile close button */}
          <button 
            className="md:hidden absolute right-3 text-white"
            onClick={() => setOpen(false)}
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>
        <div className="flex flex-col flex-grow overflow-y-auto">
          <nav className="sidebar-menu">
            {/* Home Link - Fixed to not use nested anchors */}
            <Link 
              href="/"
              className={cn(
                "sidebar-menu-item",
                location === "/" && "sidebar-menu-item-active"
              )}
            >
              <i className="ri-home-line mr-2 text-base"></i>
              <span>Inicio</span>
            </Link>
            
            {/* Quotation Link - Fixed to not use nested anchors */}
            <Link 
              href="/quotation"
              className={cn(
                "sidebar-menu-item",
                location === "/quotation" && "sidebar-menu-item-active"
              )}
            >
              <i className="ri-file-list-3-line mr-2 text-base"></i>
              <span>Cotizador</span>
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}

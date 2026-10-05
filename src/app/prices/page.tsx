import { PricesView } from "@/components/PricesView";

export const metadata = { title: "Price changes · FPL Hub" };

export default function PricesPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">Price changes</h1>
      <p className="text-sm text-muted">
        Which players are closest to a price rise or fall, how fast managers are moving, and when the change is expected.
      </p>
      <PricesView />
    </div>
  );
}

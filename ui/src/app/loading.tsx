import { Loader } from "@/components/motion/loader";

export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader variant="comet" size={40} />
    </div>
  );
}

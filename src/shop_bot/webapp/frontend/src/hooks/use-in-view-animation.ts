import { useRef } from "react";
import { useInView } from "framer-motion";

interface UseInViewAnimationOptions {
  once?: boolean;
  margin?: string;
}

export function useInViewAnimation(options: UseInViewAnimationOptions = {}) {
  const ref = useRef(null);
  const inView = useInView(ref, {
    once: options.once ?? true,
    margin: options.margin ?? "-80px",
  });

  const variants = {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0 },
  };

  const transition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] };

  return { ref, inView, variants, transition };
}

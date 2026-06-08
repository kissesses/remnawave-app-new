import { useState } from "react";
import { Smartphone, Monitor, Apple, Terminal } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import { Skeleton } from "@/components/ui/skeleton";

const platforms = [
  { id: "android", label: "Android", icon: Smartphone },
  { id: "ios", label: "iOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
] as const;

export function VpnSetupPage() {
  const { data: config, isLoading } = useCabinetConfig();
  const [platform, setPlatform] = useState<string>("android");
  const howto = config?.howto;

  const text =
    platform === "android"
      ? howto?.android
      : platform === "ios"
        ? howto?.ios
        : platform === "windows"
          ? howto?.windows
          : howto?.linux;

  return (
    <>
      <Header title="Настройка VPN" showBack />
      <div className="page-scroll pb-8 p-4 space-y-4">
        {howto?.intro && (
          <Card>
            <CardContent className="pt-4 text-sm text-muted-foreground whitespace-pre-wrap">
              {howto.intro}
            </CardContent>
          </Card>
        )}
        <Tabs value={platform} onValueChange={setPlatform}>
          <TabsList className="grid grid-cols-4">
            {platforms.map((p) => (
              <TabsTrigger key={p.id} value={p.id} className="text-xs px-1">
                <p.icon className="h-4 w-4" />
              </TabsTrigger>
            ))}
          </TabsList>
          {platforms.map((p) => (
            <TabsContent key={p.id} value={p.id}>
              <Card>
                <CardContent className="pt-4">
                  {isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : text ? (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{text}</div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Инструкция для {p.label} пока не добавлена
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}

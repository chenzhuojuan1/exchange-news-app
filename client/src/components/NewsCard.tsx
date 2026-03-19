import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ExternalLink, Calendar, Star } from "lucide-react";

interface NewsCardProps {
  id: number;
  title: string;
  titleDisplay: string | null;
  titleChinese: string | null;
  publishDate: string;
  url: string;
  matchedKeywords: string;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (id: number, selected: boolean) => void;
  isFavorited?: boolean;
  onToggleFavorite?: (id: number, favorited: boolean) => void;
}

export function NewsCard({
  id,
  title,
  titleDisplay,
  titleChinese,
  publishDate,
  url,
  matchedKeywords,
  selectable = false,
  selected = false,
  onSelectChange,
  isFavorited = false,
  onToggleFavorite,
}: NewsCardProps) {
  const keywords = matchedKeywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return (
    <Card
      className={`group hover:shadow-md transition-all duration-200 border-l-4 ${
        selected
          ? "border-l-primary bg-primary/5 shadow-sm"
          : "border-l-primary/30 hover:border-l-primary"
      }`}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          {selectable && (
            <div className="pt-1 shrink-0">
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) =>
                  onSelectChange?.(id, checked === true)
                }
                className="h-5 w-5"
              />
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            {/* Title row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm sm:text-base font-semibold text-foreground hover:text-primary transition-colors line-clamp-2 leading-relaxed"
                >
                  {titleDisplay || title}
                </a>
                {titleChinese && (
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                    {titleChinese}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                {onToggleFavorite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${isFavorited ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground hover:text-yellow-500"}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onToggleFavorite(id, !isFavorited);
                    }}
                    title={isFavorited ? "取消收藏" : "收藏"}
                  >
                    <Star className={`h-4 w-4 ${isFavorited ? "fill-current" : ""}`} />
                  </Button>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors p-2"
                  title="查看原文"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{publishDate}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {keywords.map((kw) => (
                  <Badge
                    key={kw}
                    variant="secondary"
                    className="text-[11px] px-2 py-0.5 font-medium"
                  >
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ItemAnalysisSummary, Question } from "../types";
import { Info, BarChart2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";

interface DifficultyD3BarChartProps {
  items: ItemAnalysisSummary[];
  questions: Question[];
}

export const DifficultyD3BarChart: React.FC<DifficultyD3BarChartProps> = ({ items, questions }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredItem, setHoveredItem] = useState<{
    item: ItemAnalysisSummary;
    question?: Question;
    x: number;
    y: number;
  } | null>(null);

  // Difficulty summary statistics
  const mudahCount = items.filter((i) => i.percentageCorrect >= 70).length;
  const sedangCount = items.filter((i) => i.percentageCorrect >= 30 && i.percentageCorrect < 70).length;
  const sukarCount = items.filter((i) => i.percentageCorrect < 30).length;

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || items.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || 700;
    const height = 320;
    const margin = { top: 30, right: 30, bottom: 45, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("style", "max-width: 100%; height: auto;");

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale: Question Numbers
    const xScale = d3
      .scaleBand()
      .domain(items.map((d) => `Q${d.questionNumber}`))
      .range([0, innerWidth])
      .padding(items.length > 20 ? 0.2 : 0.35);

    // Y Scale: 0 to 100 %
    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .nice()
      .range([innerHeight, 0]);

    // Grid lines (horizontal)
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "#27272a")
      .attr("stroke-dasharray", "3,3");

    // Threshold Reference Zones & Lines
    // 1. Sukar threshold line (<30%)
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(30))
      .attr("y2", yScale(30))
      .attr("stroke", "#f43f5e")
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(30) + 12)
      .attr("text-anchor", "end")
      .attr("fill", "#f43f5e")
      .attr("font-size", "9px")
      .attr("font-weight", "600")
      .text("Batas Sukar (<30%)");

    // 2. Mudah threshold line (>=70%)
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(70))
      .attr("y2", yScale(70))
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(70) - 5)
      .attr("text-anchor", "end")
      .attr("fill", "#10b981")
      .attr("font-size", "9px")
      .attr("font-weight", "600")
      .text("Batas Mudah (≥70%)");

    // X Axis
    const xAxis = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));

    xAxis.select(".domain").attr("stroke", "#3f3f46");
    xAxis.selectAll(".tick line").attr("stroke", "#3f3f46");
    xAxis
      .selectAll(".tick text")
      .attr("fill", "#94a3b8")
      .attr("font-size", items.length > 25 ? "8px" : "10px")
      .attr("font-weight", "600");

    // Y Axis
    const yAxis = g.append("g").call(
      d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((d) => `${d}%`)
    );

    yAxis.select(".domain").attr("stroke", "#3f3f46");
    yAxis.selectAll(".tick line").attr("stroke", "#3f3f46");
    yAxis
      .selectAll(".tick text")
      .attr("fill", "#94a3b8")
      .attr("font-size", "10px")
      .attr("font-weight", "500");

    // Y Axis Label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -38)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .text("% Siswa Menjawab Benar");

    // Bar Color Function
    const getColor = (pct: number) => {
      if (pct >= 70) return "#10b981"; // Emerald / Green
      if (pct >= 30) return "#f59e0b"; // Amber / Yellow
      return "#f43f5e"; // Rose / Red
    };

    // Bars
    const barGroups = g
      .selectAll(".bar-group")
      .data(items)
      .enter()
      .append("g")
      .attr("class", "bar-group")
      .attr("cursor", "pointer")
      .on("mouseenter", function (event: MouseEvent, d: ItemAnalysisSummary) {
        const matchingQ = questions.find((q) => q.id === d.questionId);
        const rect = this.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setHoveredItem({
          item: d,
          question: matchingQ,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 10,
        });

        d3.select(this).select("rect").attr("opacity", 0.8).attr("stroke", "#ffffff").attr("stroke-width", 1.5);
      })
      .on("mouseleave", function () {
        setHoveredItem(null);
        d3.select(this).select("rect").attr("opacity", 1).attr("stroke", "none");
      });

    // Rectangles with animation
    barGroups
      .append("rect")
      .attr("x", (d: ItemAnalysisSummary) => xScale(`Q${d.questionNumber}`) || 0)
      .attr("width", xScale.bandwidth())
      .attr("y", innerHeight)
      .attr("height", 0)
      .attr("rx", 3)
      .attr("fill", (d: ItemAnalysisSummary) => getColor(d.percentageCorrect))
      .transition()
      .duration(750)
      .delay((_, i) => i * 25)
      .attr("y", (d: ItemAnalysisSummary) => yScale(d.percentageCorrect))
      .attr("height", (d: ItemAnalysisSummary) => Math.max(0, innerHeight - yScale(d.percentageCorrect)));

    // Value Labels on top of bars
    barGroups
      .append("text")
      .attr("x", (d: ItemAnalysisSummary) => (xScale(`Q${d.questionNumber}`) || 0) + xScale.bandwidth() / 2)
      .attr("y", (d: ItemAnalysisSummary) => yScale(d.percentageCorrect) - 5)
      .attr("text-anchor", "middle")
      .attr("fill", "#cbd5e1")
      .attr("font-size", items.length > 20 ? "8px" : "9px")
      .attr("font-weight", "700")
      .attr("opacity", 0)
      .text((d: ItemAnalysisSummary) => `${d.percentageCorrect}%`)
      .transition()
      .duration(750)
      .delay((_, i) => i * 25 + 200)
      .attr("opacity", 1);
  }, [items, questions]);

  return (
    <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-4">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Visualisasi D3.js: Tingkat Kesukaran Butir Soal</h3>
            <p className="text-xs text-slate-400">
              Persentase keberhasilan siswa menjawab benar untuk setiap nomor butir soal
            </p>
          </div>
        </div>

        {/* Legend Badges */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg font-semibold text-[11px]">
            <CheckCircle2 className="w-3 h-3" />
            Mudah (≥70%): {mudahCount} Soal
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg font-semibold text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            Sedang (30-69%): {sedangCount} Soal
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg font-semibold text-[11px]">
            <AlertCircle className="w-3 h-3" />
            Sukar (&lt;30%): {sukarCount} Soal
          </span>
        </div>
      </div>

      {/* SVG Canvas Container with Tooltip */}
      <div ref={containerRef} className="relative w-full overflow-x-auto min-h-[320px]">
        <svg ref={svgRef} className="w-full" />

        {/* Interactive Floating Tooltip */}
        {hoveredItem && (
          <div
            className="absolute z-20 pointer-events-none bg-[#18181b] border border-slate-700 text-white rounded-xl p-3 shadow-2xl text-xs space-y-1.5 -translate-x-1/2 -translate-y-full min-w-[220px] max-w-[280px]"
            style={{
              left: `${hoveredItem.x}px`,
              top: `${hoveredItem.y}px`,
            }}
          >
            <div className="flex items-center justify-between pb-1 border-b border-slate-700">
              <span className="font-bold text-indigo-400">Soal #{hoveredItem.item.questionNumber}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  hoveredItem.item.percentageCorrect >= 70
                    ? "bg-emerald-500/20 text-emerald-300"
                    : hoveredItem.item.percentageCorrect >= 30
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {hoveredItem.item.difficultyCategory} ({hoveredItem.item.percentageCorrect}%)
              </span>
            </div>

            {hoveredItem.question && (
              <p className="text-slate-300 line-clamp-2 text-[11px] leading-tight">
                {hoveredItem.question.questionText}
              </p>
            )}

            <div className="grid grid-cols-2 gap-1 pt-1 text-[10px] text-slate-400">
              <div>
                Topik: <span className="text-slate-200 font-medium">{hoveredItem.item.topicTag}</span>
              </div>
              <div>
                Kunci: <span className="text-indigo-300 font-bold font-mono">{hoveredItem.item.correctAnswer}</span>
              </div>
              <div>
                Benar: <span className="text-emerald-400 font-bold">{hoveredItem.item.correctResponses}</span> / {hoveredItem.item.totalResponses}
              </div>
              <div>
                Daya Pembeda: <span className="text-slate-200 font-bold">{hoveredItem.item.discriminationIndex}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analytical Insight Footer */}
      <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-200">Rekomendasi Evaluasi:</strong> Butir soal berkategori{" "}
          <strong className="text-rose-400">Sukar (&lt;30%)</strong> disarankan untuk dikaji ulang stimuli atau daya pembedanya, sedangkan butir soal{" "}
          <strong className="text-emerald-400">Mudah (≥70%)</strong> sangat efektif sebagai soal apersepsi dan penguat motivasi belajar siswa.
        </p>
      </div>
    </div>
  );
};

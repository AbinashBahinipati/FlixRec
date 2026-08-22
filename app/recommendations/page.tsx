import RecommendationsDashboard from "./RecommendationsDashboard";

export default function RecommendationsPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white pt-24 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
            Recommended For You
          </h1>
          <p className="text-xl text-gray-400">
            Picked based on your taste and activity
          </p>
        </div>

        <RecommendationsDashboard />
      </div>
    </div>
  );
}

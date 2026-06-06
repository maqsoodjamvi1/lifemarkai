"use client";

export function DemoButton() {
  const handleCreateSampleProject = async () => {
    try {
      const response = await fetch("/api/demo/create-sample-project");
      const data = await response.json();

      if (data.success) {
        window.location.href = data.editorUrl;
      } else {
        alert(`Error: ${data.error}\n\n${data.details}`);
      }
    } catch (error) {
      alert(`Failed to create sample project: ${error}`);
    }
  };

  return (
    <button
      onClick={handleCreateSampleProject}
      className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-200 transform hover:scale-105"
    >
      Create Sample Project & Open Editor
    </button>
  );
}

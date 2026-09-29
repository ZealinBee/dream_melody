import RecordingStudio from "@/components/RecordingStudio";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="w-full max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-green">Dream Melody</p>
        <h1 className="mt-4 text-[36px] font-medium text-dark-blue sm:text-5xl">
          Hum the tune in your head
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-grey-1">
          Record for as long as you like. Every take is saved on this machine.
        </p>

        <div className="mt-10">
          <RecordingStudio />
        </div>
      </div>
    </main>
  );
}

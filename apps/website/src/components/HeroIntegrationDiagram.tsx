import { CheckCircle2 } from "lucide-react";

export function HeroIntegrationDiagram() {
  return (
    <div className="relative w-full h-full min-h-[500px] flex items-center justify-center">
      {/* Connection lines - dashed, symmetric layout */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {/* Lines from hub green border to icon border center */}
        {/* Hub border -> Claude Code (30%,25%) border */}
        <line
          x1="46%"
          y1="45%"
          x2="31%"
          y2="27%"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        {/* Hub border -> Cursor (70%,25%) border */}
        <line
          x1="54%"
          y1="45%"
          x2="69%"
          y2="27%"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        {/* Hub border -> Copilot (15%,50%) border - horizontal */}
        <line
          x1="44%"
          y1="50%"
          x2="20%"
          y2="50%"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        {/* Hub border -> Windsurf (85%,50%) border - horizontal */}
        <line
          x1="56%"
          y1="50%"
          x2="80%"
          y2="50%"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        {/* Hub border -> OpenAI (30%,75%) border */}
        <line
          x1="46%"
          y1="55%"
          x2="31%"
          y2="73%"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        {/* Hub border -> Gemini (70%,75%) border */}
        <line
          x1="54%"
          y1="55%"
          x2="69%"
          y2="73%"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      </svg>

      {/* Central GAL Hub */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <div
          className="w-32 h-32 rounded-2xl bg-white border-2 border-[#00FF2A] flex flex-col items-center justify-center shadow-xl"
          style={{ boxShadow: "0 8px 32px rgba(0, 255, 42, 0.15)" }}
        >
          {/* Angular geometric layers */}
          <svg viewBox="0 0 36 36" className="w-12 h-12 mb-2" fill="none">
            <rect width="36" height="36" rx="8" fill="black" />
            <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
            <path
              d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
              fill="#00FF2A"
              fillOpacity="0.6"
            />
            <path
              d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
              fill="#00FF2A"
              fillOpacity="0.3"
            />
          </svg>
          <span className="text-lg font-black tracking-tight text-gray-900">
            gal<span className="text-[#00FF2A]">.</span>run
          </span>
        </div>
      </div>

      {/* Coding Agents around the hub - 6 agents in symmetric hexagonal pattern */}
      {/* All icons use left/top with -translate-x-1/2 -translate-y-1/2 for perfect centering */}

      {/* Claude Code - Top Left */}
      <div className="absolute left-[30%] top-[25%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-lg hover:scale-105 hover:border-[#D97757] transition-all cursor-pointer">
          <svg viewBox="0 0 512 509.64" className="w-8 h-8">
            <path
              fill="#D77655"
              d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"
            />
            <path
              fill="#FCF2EE"
              fillRule="nonzero"
              d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"
            />
          </svg>
        </div>
      </div>

      {/* Cursor - Top Right */}
      <div className="absolute left-[70%] top-[25%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-lg hover:scale-105 hover:border-gray-400 transition-all cursor-pointer">
          <svg viewBox="0 0 512 512" className="w-8 h-8 rounded-md" fill="none">
            <rect width="512" height="512" rx="122" fill="#000" />
            <path
              d="M255.428 423l148.991-83.5L255.428 256l-148.99 83.5 148.99 83.5z"
              fill="url(#cursor-paint0)"
            />
            <path
              d="M404.419 339.5v-167L255.428 89v167l148.991 83.5z"
              fill="url(#cursor-paint1)"
            />
            <path
              d="M255.428 89l-148.99 83.5v167l148.99-83.5V89z"
              fill="url(#cursor-paint2)"
            />
            <path
              d="M404.419 172.5L255.428 423V256l148.991-83.5z"
              fill="#E4E4E4"
            />
            <path
              d="M404.419 172.5L255.428 256l-148.99-83.5h297.981z"
              fill="#fff"
            />
            <defs>
              <linearGradient
                id="cursor-paint0"
                x1="255.428"
                y1="256"
                x2="255.428"
                y2="423"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset=".16" stopColor="#fff" stopOpacity=".39" />
                <stop offset=".658" stopColor="#fff" stopOpacity=".8" />
              </linearGradient>
              <linearGradient
                id="cursor-paint1"
                x1="404.419"
                y1="173.015"
                x2="257.482"
                y2="261.497"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset=".182" stopColor="#fff" stopOpacity=".31" />
                <stop offset=".715" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <linearGradient
                id="cursor-paint2"
                x1="255.428"
                y1="89"
                x2="112.292"
                y2="342.802"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#fff" stopOpacity=".6" />
                <stop offset=".667" stopColor="#fff" stopOpacity=".22" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* GitHub Copilot - Middle Left */}
      <div className="absolute left-[15%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-lg hover:scale-105 hover:border-[#6E40C9] transition-all cursor-pointer">
          <svg viewBox="0 0 512 416" className="w-8 h-8" fill="#24292F">
            <path
              d="M181.33 266.143c0-11.497 9.32-20.818 20.818-20.818 11.498 0 20.819 9.321 20.819 20.818v38.373c0 11.497-9.321 20.818-20.819 20.818-11.497 0-20.818-9.32-20.818-20.818v-38.373zM308.807 245.325c-11.477 0-20.798 9.321-20.798 20.818v38.373c0 11.497 9.32 20.818 20.798 20.818 11.497 0 20.818-9.32 20.818-20.818v-38.373c0-11.497-9.32-20.818-20.818-20.818z"
              fillRule="nonzero"
            />
            <path d="M512.002 246.393v57.384c-.02 7.411-3.696 14.638-9.67 19.011C431.767 374.444 344.695 416 256 416c-98.138 0-196.379-56.542-246.33-93.21-5.975-4.374-9.65-11.6-9.671-19.012v-57.384a35.347 35.347 0 016.857-20.922l15.583-21.085c8.336-11.312 20.757-14.31 33.98-14.31 4.988-56.953 16.794-97.604 45.024-127.354C155.194 5.77 226.56 0 256 0c29.441 0 100.807 5.77 154.557 62.722 28.19 29.75 40.036 70.401 45.025 127.354 13.263 0 25.602 2.936 33.958 14.31l15.583 21.127c4.476 6.077 6.878 13.345 6.878 20.88zm-97.666-26.075c-.677-13.058-11.292-18.19-22.338-21.824-11.64 7.309-25.848 10.183-39.46 10.183-14.454 0-41.432-3.47-63.872-25.869-5.667-5.625-9.527-14.454-12.155-24.247a212.902 212.902 0 00-20.469-1.088c-6.098 0-13.099.349-20.551 1.088-2.628 9.793-6.509 18.622-12.155 24.247-22.4 22.4-49.418 25.87-63.872 25.87-13.612 0-27.86-2.855-39.501-10.184-11.005 3.613-21.558 8.828-22.277 21.824-1.17 24.555-1.272 49.11-1.375 73.645-.041 12.318-.082 24.658-.288 36.976.062 7.166 4.374 13.818 10.882 16.774 52.97 24.124 103.045 36.278 149.137 36.278 46.01 0 96.085-12.154 149.014-36.278 6.508-2.956 10.84-9.608 10.881-16.774.637-36.832.124-73.809-1.642-110.62h.041zM107.521 168.97c8.643 8.623 24.966 14.392 42.56 14.392 13.448 0 39.03-2.874 60.156-24.329 9.28-8.951 15.05-31.35 14.413-54.079-.657-18.231-5.769-33.28-13.448-39.665-8.315-7.371-27.203-10.574-48.33-8.644-22.399 2.238-41.267 9.588-50.875 19.833-20.798 22.728-16.323 80.317-4.476 92.492zm130.556-56.008c.637 3.51.965 7.35 1.273 11.517 0 2.875 0 5.77-.308 8.952 6.406-.636 11.847-.636 16.959-.636s10.553 0 16.959.636c-.329-3.182-.329-6.077-.329-8.952.329-4.167.657-8.007 1.294-11.517-6.735-.637-12.812-.965-17.924-.965s-11.21.328-17.924.965zm49.275-8.008c-.637 22.728 5.133 45.128 14.413 54.08 21.105 21.454 46.708 24.328 60.155 24.328 17.596 0 33.918-5.769 42.561-14.392 11.847-12.175 16.322-69.764-4.476-92.492-9.608-10.245-28.476-17.595-50.875-19.833-21.127-1.93-40.015 1.273-48.33 8.644-7.679 6.385-12.791 21.434-13.448 39.665z" />
          </svg>
        </div>
      </div>

      {/* Windsurf - Middle Right */}
      <div className="absolute left-[85%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-lg hover:scale-105 hover:border-[#09B6A2] transition-all cursor-pointer">
          <svg viewBox="0 0 512 512" className="w-8 h-8" fill="none">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M507.307 106.752h-4.864a46.653 46.653 0 00-43.025 28.969 46.66 46.66 0 00-3.482 17.879v104.789c0 20.907-17.152 37.867-37.547 37.867a38.785 38.785 0 01-31.402-16.491l-106.07-152.832a46.865 46.865 0 00-38.613-20.266c-24.192 0-45.952 20.736-45.952 46.357v105.387c0 20.906-17.003 37.866-37.547 37.866-12.16 0-24.234-6.165-31.402-16.49L8.704 108.757C6.016 104.917 0 106.816 0 111.531v91.392c0 4.608 1.408 9.088 4.01 12.885l116.801 168.299c6.912 9.941 17.066 17.322 28.821 20.01 29.376 6.742 56.427-16.085 56.427-45.162V253.653c0-20.906 16.789-37.866 37.546-37.866h.043c12.501 0 24.213 6.144 31.403 16.49L381.12 385.088a45.872 45.872 0 0038.613 20.267c24.704 0 45.888-20.758 45.888-46.358V253.632c0-20.907 16.79-37.867 37.547-37.867h4.139c2.602 0 4.693-2.133 4.693-4.736v-99.562a4.7 4.7 0 00-1.366-3.34 4.705 4.705 0 00-3.327-1.396v.021z"
              fill="#000"
            />
          </svg>
        </div>
      </div>

      {/* OpenAI - Bottom Left */}
      <div className="absolute left-[30%] top-[75%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-lg hover:scale-105 hover:border-[#10A37F] transition-all cursor-pointer">
          <svg
            viewBox="0 0 512 512"
            className="w-8 h-8"
            fill="#000"
            fillRule="evenodd"
            clipRule="evenodd"
            strokeLinejoin="round"
            strokeMiterlimit="2"
          >
            <path
              d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z"
              fillRule="nonzero"
            />
          </svg>
        </div>
      </div>

      {/* Google Gemini - Bottom Right */}
      <div className="absolute left-[70%] top-[75%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-lg hover:scale-105 hover:border-[#4285F4] transition-all cursor-pointer">
          {/* Official Google Gemini icon from UXWing - 4-pointed sparkle */}
          <svg viewBox="0 0 65 65" className="w-8 h-8" fill="none">
            <path
              d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z"
              fill="url(#gemini-official-gradient)"
            />
            <defs>
              <linearGradient
                id="gemini-official-gradient"
                x1="18.447"
                y1="43.42"
                x2="52.153"
                y2="15.004"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#4893FC" />
                <stop offset=".27" stopColor="#4893FC" />
                <stop offset=".777" stopColor="#969DFF" />
                <stop offset="1" stopColor="#BD99FE" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Status badge - bottom left */}
      <div className="absolute left-[8%] bottom-[8%] z-30">
        <div className="px-3 py-1.5 rounded-full bg-green-50 border border-green-200 flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-[#00FF2A]" />
          <span className="text-xs font-medium text-green-700">
            All Agents Governed
          </span>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

export const AMELIA_AVATAR_URL = '/src/assets/images/amelia_avatar_1794845399080.jpg';
export const AMELIA_BACKDROP_URL = '/src/assets/images/amelia_ambient_backdrop_1794845398982.jpg';

interface AmeliaAvatarProps {
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-11 h-11 text-base',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-2xl',
};

export function AmeliaAvatar({ name = 'Amelia', size = 'md', className = '' }: AmeliaAvatarProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative shrink-0 rounded-full p-[1.5px] bg-gradient-to-tr from-[#6D28D9] via-[#A78BFA] to-[#F472B6] ${SIZE_MAP[size]} ${className}`}
    >
      <div className="w-full h-full rounded-full overflow-hidden bg-[#161320] flex items-center justify-center">
        {!failed ? (
          <img
            src={AMELIA_AVATAR_URL}
            alt={`Foto profil ${name}`}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-semibold text-[#E9D5FF] select-none">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
